'use server'

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { logError } from '@/lib/errorLogger';

async function logAudit(userId: number, action: string, entity: string, entityId?: number, details?: any) {
    try {
        await prisma.systemLog.create({
            data: {
                userId,
                action,
                entity,
                entityId,
                details: details ? JSON.stringify(details) : null
            }
        });
    } catch (e) {
        console.error('Audit log failed', e);
    }
}

export async function createInspectionRecord(data: {
    itemId: number;
    poId?: number;
    fileName: string;
    fileData: string;
    status: string;
    notes?: string;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const record = await prisma.inspectionRecord.create({
            data: {
                itemId: data.itemId,
                poId: data.poId || null,
                fileName: data.fileName,
                fileData: data.fileData,
                status: data.status,
                notes: data.notes || '',
                inspectorId: session.user.id,
            }
        });

        await logAudit(session.user.id, 'CREATE_INSPECTION', 'Item', data.itemId, { 
            fileName: data.fileName, 
            status: data.status,
            poId: data.poId 
        });

        revalidatePath('/quality');
        revalidatePath('/inventory');
        if (data.poId) revalidatePath(`/purchasing/${data.poId}`);
        
        return { success: true, data: JSON.parse(JSON.stringify(record)) };
    } catch (error) {
        await logError('createInspectionRecord', error);
        return { success: false, error: 'Failed to save inspection record' };
    }
}

export async function getInspectionRecords(filters?: {
    itemId?: number;
    poId?: number;
    status?: string;
    search?: string;
}) {
    try {
        const where: any = {};
        if (filters?.itemId) where.itemId = filters.itemId;
        if (filters?.poId) where.poId = filters.poId;
        if (filters?.status && filters.status !== 'All') where.status = filters.status;
        
        if (filters?.search) {
            where.OR = [
                { item: { sku: { contains: filters.search, mode: 'insensitive' } } },
                { item: { name: { contains: filters.search, mode: 'insensitive' } } },
                { fileName: { contains: filters.search, mode: 'insensitive' } },
            ];
            
            // Try to match PO number if it looks like a number or has PO prefix
            if (filters.search.length > 2) {
                 where.OR.push({ po: { poNumber: { contains: filters.search, mode: 'insensitive' } } });
            }
        }

        // Use select instead of include to explicitly omit the massive 'fileData' string 
        // when loading lists. This yields enormous bandwidth and performance gains!
        const records = await prisma.inspectionRecord.findMany({
            where,
            select: {
                id: true,
                itemId: true,
                poId: true,
                fileName: true,
                status: true,
                notes: true,
                inspectorId: true,
                createdAt: true,
                updatedAt: true,
                item: { select: { sku: true, name: true } },
                po: { select: { poNumber: true } },
                inspector: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        return { success: true, data: JSON.parse(JSON.stringify(records)) };
    } catch (error) {
        await logError('getInspectionRecords', error);
        return { success: false, error: 'Failed to load inspection records' };
    }
}

export async function getInspectionFile(id: number) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const record = await prisma.inspectionRecord.findUnique({
            where: { id },
            select: {
                id: true,
                fileName: true,
                fileData: true
            }
        });

        if (!record) return { success: false, error: 'File not found' };
        return { success: true, data: record };
    } catch (error) {
        await logError('getInspectionFile', error);
        return { success: false, error: 'Failed to load file contents' };
    }
}

export async function deleteInspectionRecord(id: number) {
    try {
        const session = await getSession();
        if (!session?.user || session.user.role !== 'Admin') return { success: false, error: 'Only admins can delete records' };

        await prisma.inspectionRecord.delete({ where: { id } });
        
        revalidatePath('/quality');
        return { success: true };
    } catch (error) {
        await logError('deleteInspectionRecord', error);
        return { success: false, error: 'Failed to delete record' };
    }
}
