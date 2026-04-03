import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: Request) {
    let payload: any = {};
    let rawPayload = '';

    try {
        // Security Verification: validate request using ICOUNT_WEBHOOK_SECRET
        const expectedSecret = process.env.ICOUNT_WEBHOOK_SECRET;
        if (!expectedSecret) {
            console.error('ICOUNT_WEBHOOK_SECRET is not configured on the server.');
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
        }

        // Parse Payload
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            payload = await req.json();
            rawPayload = JSON.stringify(payload);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await req.formData();
            formData.forEach((value, key) => { payload[key] = value; });
            rawPayload = JSON.stringify(payload);
        } else {
            return NextResponse.json({ error: 'Unsupported Media Type' }, { status: 415 });
        }

        // Token checks
        const urlParams = new URL(req.url).searchParams;
        const receivedSecret = urlParams.get('secret') || 
                               req.headers.get('x-icount-secret') || 
                               req.headers.get('x-icount-signature') || 
                               payload.secret || 
                               payload.token;
                               
        if (receivedSecret !== expectedSecret) {
            console.warn('Webhook unauthorized: secret mismatch');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Filter Logic:
        // Inside the route, verify the payload: if (req.body.doctype !== "po") { return res.sendStatus(200); }.
        if (payload.doctype !== 'po') {
            return NextResponse.json({ message: 'OK' }, { status: 200 }); 
        }

        // Data Translation (Mapping):
        // doc_id (from iCount) ➔ order_number (in our DB conceptually mapped to poNumber)
        // client_name ➔ vendor_name (mapped to supplier)
        // total_amount ➔ total_cost
        const order_number = String(payload.doc_id);
        const vendor_name = payload.client_name;
        const total_cost = Number(payload.total_amount) || 0;
        
        // items_array ➔ Loop through and map item_sku to our sku, and item_quantity to our quantity
        let items_array = payload.items;
        if (typeof items_array === 'string') {
            try { items_array = JSON.parse(items_array); } catch(e) { items_array = []; }
        }
        if (!Array.isArray(items_array)) {
            items_array = [];
        }

        if (!order_number || !vendor_name) {
             throw new Error("Missing required mapping fields (doc_id, client_name). Payload: " + rawPayload);
        }

        let hasUnidentifiedSku = false;
        const lineData: any[] = [];

        for (const item of items_array) {
            const item_sku = item.sku || item.item_code || item.item_name || item.description;
            const item_quantity = Number(item.quantity) || 1;
            const unit_cost = Number(item.unit_price || item.price) || 0;

            if (item_sku) {
                // First check external mappings table
                const mapping = await prisma.externalMapping.findFirst({
                    where: { externalSku: String(item_sku), source: 'iCount' },
                    include: { item: true }
                });

                if (mapping) {
                    // Match found in mapping table -> auto map it!
                    lineData.push({
                        quantity: item_quantity,
                        unitCost: mapping.item.cost > 0 ? mapping.item.cost : unit_cost,
                        isAutoMapped: true,
                        item: { connect: { id: mapping.internalItemId } }
                    });
                } else {
                    // Fallback to strict DB search by our internal SKU
                    const dbItem = await prisma.item.findUnique({ where: { sku: String(item_sku) } });
                    if (dbItem) {
                        // SKU exists directly -> proper linkage
                        lineData.push({
                            quantity: item_quantity,
                            unitCost: dbItem.cost > 0 ? dbItem.cost : unit_cost,
                            item: { connect: { id: dbItem.id } }
                        });
                    } else {
                        // Unidentified SKU
                        hasUnidentifiedSku = true;
                        lineData.push({
                            quantity: item_quantity,
                            unitCost: unit_cost,
                            newItemName: String(item.item_name || item_sku), 
                            newItemSku: String(item_sku)
                        });
                    }
                }
            } else {
                hasUnidentifiedSku = true;
                lineData.push({
                    quantity: item_quantity,
                    unitCost: unit_cost,
                    newItemName: item.item_name || 'Unknown Item'
                });
            }
        }

        // Database Action (Upsert)
        // Ensure the entire process is wrapped in a SQL Transaction to maintain data integrity.
        const finalStatus = hasUnidentifiedSku ? 'Pending SKU Mapping' : 'Synced';
        
        await prisma.$transaction(async (tx) => {
             // If the doc_id already exists, update the record
             const existingPo = await tx.purchaseOrder.findUnique({ 
                 where: { poNumber: order_number } 
             });

             if (existingPo) {
                 await tx.purchaseOrder.update({
                     where: { id: existingPo.id },
                     data: {
                         supplier: vendor_name,
                         totalCost: total_cost,
                         status: finalStatus,
                         pendingManualMapping: hasUnidentifiedSku,
                         lines: {
                             deleteMany: {}, // Prevent orphaned lines by replacing
                             create: lineData
                         }
                     }
                 });
             } else {
                 // If not, create a new PO entry
                 await tx.purchaseOrder.create({
                     data: {
                         poNumber: order_number,
                         supplier: vendor_name,
                         totalCost: total_cost,
                         status: finalStatus,
                         pendingManualMapping: hasUnidentifiedSku,
                         lines: {
                             create: lineData
                         }
                     }
                 });
             }
        });

        // Response: Return res.sendStatus(200) only after the data has been successfully committed to Neon.
        return NextResponse.json({ message: 'OK' }, { status: 200 });

    } catch (error: any) {
        console.error('Webhook processing error:', error);
        // Error logging fallback
        try {
            await prisma.webhookError.create({
                data: {
                    payload: rawPayload || 'Error parsing payload',
                    error: error.message || String(error),
                    source: 'iCount'
                }
            });
        } catch (_) {} // Ignore logging errors here
        
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
