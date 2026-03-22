import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
    let payload: any = {};
    let rawPayload = '';
    let isPayloadParsed = false;

    try {
        const expectedSecret = process.env.ICOUNT_WEBHOOK_SECRET;
        
        if (!expectedSecret) {
            console.error('ICOUNT_WEBHOOK_SECRET is not configured on the server.');
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }

        // 1. Payload Parsing (supports JSON and form-urlencoded)
        const contentType = req.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            payload = await req.json();
            rawPayload = JSON.stringify(payload);
            isPayloadParsed = true;
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await req.formData();
            formData.forEach((value, key) => {
                payload[key] = value;
            });
            rawPayload = JSON.stringify(payload);
            isPayloadParsed = true;
        } else {
            return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
        }

        // 2. Security Handshake
        // Validate request from iCount. 
        // We check query string, header, or payload body for the secret
        const { searchParams } = new URL(req.url);
        const receivedSecret = searchParams.get('secret') || 
                               req.headers.get('x-icount-secret') || 
                               req.headers.get('x-icount-signature') || 
                               payload.secret || 
                               payload.token;
                               
        if (receivedSecret !== expectedSecret) {
            console.warn('Webhook unauthorized: secret mismatch');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 3. Database Integration & Event Filtering
        // Expected event: 'Purchase Order' (הזמנת רכש)
        const docName = payload.doc_name || payload.doc_type_name || payload.type || payload.doc_type;
        
        // If it's not a Purchase Order, we acknowledge receipt to prevent retries
        if (docName !== 'הזמנת רכש' && docName !== 'Purchase Order') {
            return NextResponse.json({ message: 'Ignored non-Purchase Order event' }, { status: 200 });
        }

        const docId = payload.doc_id || payload.id;
        const clientName = payload.client_name || payload.supplier || payload.client;
        
        let items = payload.items || payload.lines || [];
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) {}
        }
        
        if (!docId) {
            throw new Error('doc_id missing from PO payload');
        }

        const poNumber = String(docId); // Or \`PO-\${docId}\`, but matching iCount exactly is better
        let pendingMapping = false;
        const lineData: any[] = [];

        // 4. SKU Mapping
        for (const item of items) {
            const sku = item.sku || item.item_code || item.item_name || item.description;
            const quantity = Number(item.quantity) || 1;
            const unitCost = Number(item.unit_price || item.price || item.cost) || 0;

            if (sku) {
                // strict DB search
                const dbItem = await prisma.item.findUnique({ where: { sku: String(sku) } });
                
                if (dbItem) {
                    // Match found -> connect
                    lineData.push({
                        quantity,
                        unitCost,
                        item: { connect: { id: dbItem.id } }
                    });
                } else {
                    // No match -> pending mapping
                    pendingMapping = true;
                    lineData.push({
                        quantity,
                        unitCost,
                        newItemName: String(item.item_name || sku),
                        newItemSku: String(sku)
                    });
                }
            } else {
                pendingMapping = true;
                lineData.push({
                    quantity,
                    unitCost,
                    newItemName: item.item_name || 'Unknown Item'
                });
            }
        }

        // 5. Upsert Logic
        const existingPo = await prisma.purchaseOrder.findUnique({ where: { poNumber } });
        
        if (existingPo) {
            // Update existing
            await prisma.purchaseOrder.update({
                where: { id: existingPo.id },
                data: {
                    supplier: clientName || existingPo.supplier,
                    pendingManualMapping: pendingMapping,
                    lines: {
                        deleteMany: {}, // clear old lines and rewrite
                        create: lineData
                    }
                }
            });
        } else {
            // Create new
            await prisma.purchaseOrder.create({
                data: {
                    poNumber,
                    supplier: clientName || 'Unknown Supplier',
                    pendingManualMapping: pendingMapping,
                    lines: {
                        create: lineData
                    }
                }
            });
        }

        // 6. Status Codes -> 200 OK
        return NextResponse.json({ message: 'Webhook processed successfully' }, { status: 200 });

    } catch (error: any) {
        // 7. Error Logging
        console.error('Webhook processing error:', error);
        
        try {
            await prisma.webhookError.create({
                data: {
                    payload: isPayloadParsed ? rawPayload : 'Error occurred before reading payload',
                    error: error.message || String(error),
                    source: 'iCount'
                }
            });
        } catch (dbErr) {
            console.error('Failed to write logic error to webhookError table:', dbErr);
        }

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
