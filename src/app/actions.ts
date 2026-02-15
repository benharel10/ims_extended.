'use server'

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getDashboardStats() {
    try {
        // 1. Total Inventory Value
        // Sum of (cost * currentStock) for all items
        const allItems = await prisma.item.findMany({
            select: {
                cost: true,
                currentStock: true,
                minStock: true,
                stocks: {
                    include: {
                        warehouse: true
                    }
                }
            }
        });

        const totalValue = allItems.reduce((sum, item) => {
            return sum + (item.cost * item.currentStock);
        }, 0);

        // 2. Low Stock Items
        // Count items where currentStock < minStock
        const lowStockCount = await prisma.item.count({
            where: {
                currentStock: {
                    lt: prisma.item.fields.minStock
                }
            }
        });

        // 3. Pending Purchase Orders
        const pendingPOs = await prisma.purchaseOrder.count({
            where: {
                status: {
                    not: 'Completed'
                }
            }
        });

        // 4. Total Items
        const totalItems = await prisma.item.count();

        // 5. Recent Shipments (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentShipments = await prisma.shipment.count({
            where: {
                createdAt: {
                    gte: sevenDaysAgo
                }
            }
        });

        // 6. Stock Value by Warehouse
        const warehouseValues: { [key: string]: number } = {};
        allItems.forEach(item => {
            item.stocks?.forEach(stock => {
                const whName = stock.warehouse.name;
                const value = item.cost * stock.quantity;
                warehouseValues[whName] = (warehouseValues[whName] || 0) + value;
            });
        });

        // 7. Stock Accuracy (Mock - could be calculated from audit logs)
        const stockAccuracy = 98.5;

        return {
            totalValue,
            lowStockCount,
            pendingPOs,
            totalItems,
            recentShipments,
            warehouseValues,
            stockAccuracy,
            activeProduction: 0 // Legacy field
        };

    } catch (error) {
        console.error('Failed to get dashboard stats:', error);
        return {
            totalValue: 0,
            lowStockCount: 0,
            pendingPOs: 0,
            totalItems: 0,
            recentShipments: 0,
            warehouseValues: {},
            stockAccuracy: 0,
            activeProduction: 0
        };
    }
}

export type ActivityItem = {
    id: string;
    type: 'Shipment' | 'PO' | 'Item' | 'Production';
    title: string;
    description: string;
    date: Date;
    status?: string;
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
    try {
        const [shipments, pos, items] = await Promise.all([
            prisma.shipment.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { toWarehouse: true, fromWarehouse: true }
            }),
            prisma.purchaseOrder.findMany({
                take: 5,
                orderBy: { updatedAt: 'desc' }
            }),
            prisma.item.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' }
            })
        ]);

        const activities: ActivityItem[] = [];

        // Map Shipments
        shipments.forEach(s => {
            let desc = `Carrier: ${s.carrier || 'N/A'}`;
            if (s.type === 'Transfer') desc = `Transfer from ${s.fromWarehouse?.name} to ${s.toWarehouse?.name}`;

            activities.push({
                id: `SH-${s.id}`,
                type: 'Shipment',
                title: `Shipment ${s.shipmentNo} ${s.status}`,
                description: desc,
                date: s.createdAt,
                status: s.status
            });
        });

        // Map POs
        pos.forEach(p => {
            activities.push({
                id: `PO-${p.id}`,
                type: 'PO',
                title: `Purchase Order ${p.poNumber}`,
                description: `Supplier: ${p.supplier} (${p.status})`,
                date: p.updatedAt, // Use updated to show recent changes
                status: p.status
            });
        });

        // Map Items
        items.forEach(i => {
            activities.push({
                id: `IT-${i.id}`,
                type: 'Item',
                title: `New Item Created`,
                description: `${i.sku} - ${i.name}`,
                date: i.createdAt
            });
        });

        // Sort by Date Descending
        return activities.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

    } catch (error) {
        console.error('Failed to get recent activity:', error);
        return [];
    }
}
