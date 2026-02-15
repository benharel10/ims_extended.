'use server'

import { prisma } from '@/lib/prisma';

export async function getInventoryValuation() {
    try {
        const items = await prisma.item.findMany({
            where: { currentStock: { gt: 0 } },
            orderBy: { currentStock: 'desc' } // Or value
        });

        const report = items.map(item => ({
            id: item.id,
            sku: item.sku,
            name: item.name,
            type: item.type,
            quantity: item.currentStock,
            unitCost: item.cost,
            totalValue: item.currentStock * item.cost
        })).sort((a, b) => b.totalValue - a.totalValue);

        return { success: true, data: report };
    } catch (error) {
        return { success: false, error: 'Failed to generate inventory report' };
    }
}

export async function getSalesPerformance() {
    try {
        const orders = await prisma.salesOrder.findMany({
            include: {
                lines: {
                    include: { item: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Compute totals
        const report = orders.map(order => {
            let revenue = 0;
            let cost = 0;

            order.lines.forEach(line => {
                revenue += line.quantity * line.unitPrice;
                // Use current item cost as proxy for historical cost
                if (line.item) {
                    cost += line.quantity * line.item.cost;
                }
            });

            return {
                id: order.id,
                soNumber: order.soNumber,
                customer: order.customer,
                status: order.status,
                date: order.createdAt,
                itemCount: order.lines.length,
                totalValue: revenue,
                totalCost: cost,
                margin: revenue - cost
            };
        });

        return { success: true, data: report };
    } catch (error) {
        return { success: false, error: 'Failed to generate sales report' };
    }
}

export async function getProductionReport() {
    try {
        const runs = await prisma.productionRun.findMany({
            include: { item: true },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        const report = runs.map(run => ({
            ...run,
            valueProduced: run.quantity * (run.item?.cost || 0)
        }));

        return { success: true, data: report };
    } catch (error) {
        return { success: false, error: 'Failed to generate production report' };
    }
}

export async function getPurchaseOrderReport() {
    try {
        const pos = await prisma.purchaseOrder.findMany({
            include: {
                lines: {
                    include: { item: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const report = pos.map(po => {
            let totalOrdered = 0;
            let totalReceived = 0;
            let totalValue = 0;

            po.lines.forEach(line => {
                totalOrdered += line.quantity;
                totalReceived += line.received;
                totalValue += line.quantity * (line.item?.cost || 0);
            });

            const completionPercent = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;

            return {
                id: po.id,
                poNumber: po.poNumber,
                supplier: po.supplier,
                status: po.status,
                createdAt: po.createdAt,
                itemCount: po.lines.length,
                totalOrdered,
                totalReceived,
                totalValue,
                completionPercent
            };
        });

        return { success: true, data: report };
    } catch (error) {
        console.error('PO Report error:', error);
        return { success: false, error: 'Failed to generate PO report' };
    }
}

export async function getLowStockReport() {
    try {
        const items = await prisma.item.findMany({
            where: {
                currentStock: {
                    lt: prisma.item.fields.minStock
                }
            },
            orderBy: { currentStock: 'asc' }
        });

        const report = items.map(item => {
            const deficit = item.minStock - item.currentStock;
            const deficitValue = deficit * item.cost;

            return {
                id: item.id,
                sku: item.sku,
                name: item.name,
                type: item.type,
                currentStock: item.currentStock,
                minStock: item.minStock,
                deficit,
                unitCost: item.cost,
                deficitValue,
                urgency: item.currentStock === 0 ? 'Critical' : item.currentStock < item.minStock * 0.5 ? 'High' : 'Medium'
            };
        });

        return { success: true, data: report };
    } catch (error) {
        return { success: false, error: 'Failed to generate low stock report' };
    }
}

export async function getWarehouseComparison() {
    try {
        const warehouses = await prisma.warehouse.findMany({
            include: {
                stocks: {
                    include: { item: true }
                }
            }
        });

        const report = warehouses.map(wh => {
            let totalItems = 0;
            let totalUnits = 0;
            let totalValue = 0;

            wh.stocks.forEach(stock => {
                totalItems++;
                totalUnits += stock.quantity;
                totalValue += stock.quantity * (stock.item?.cost || 0);
            });

            return {
                id: wh.id,
                name: wh.name,
                location: wh.location || 'N/A',
                totalItems,
                totalUnits,
                totalValue,
                avgValuePerItem: totalItems > 0 ? totalValue / totalItems : 0
            };
        });

        return { success: true, data: report };
    } catch (error) {
        console.error('Warehouse comparison error:', error);
        return { success: false, error: 'Failed to generate warehouse report' };
    }
}

export async function getReportSummary() {
    try {
        const [items, pos, sales, production, warehouses] = await Promise.all([
            prisma.item.findMany({ select: { currentStock: true, cost: true, minStock: true } }),
            prisma.purchaseOrder.count({ where: { status: { not: 'Completed' } } }),
            prisma.salesOrder.findMany({ include: { lines: true } }),
            prisma.productionRun.findMany({ select: { quantity: true, item: { select: { cost: true } } } }),
            prisma.warehouse.count()
        ]);

        const totalInventoryValue = items.reduce((sum, item) => sum + (item.currentStock * item.cost), 0);
        const lowStockCount = items.filter(item => item.currentStock < item.minStock).length;

        let totalRevenue = 0;
        sales.forEach(so => {
            so.lines.forEach(line => {
                totalRevenue += line.quantity * line.unitPrice;
            });
        });

        const totalProductionValue = production.reduce((sum, run) => {
            return sum + (run.quantity * (run.item?.cost || 0));
        }, 0);

        return {
            success: true,
            data: {
                totalInventoryValue,
                totalItems: items.length,
                lowStockCount,
                pendingPOs: pos,
                totalRevenue,
                totalProductionValue,
                warehouseCount: warehouses
            }
        };
    } catch (error) {
        console.error('Summary error:', error);
        return { success: false, error: 'Failed to generate summary' };
    }
}

export async function getProfitLossReport(year?: number, month?: number) {
    try {
        // Build date filter
        let dateFilter: any = {};

        if (year && month) {
            // Specific month
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0, 23, 59, 59);
            dateFilter = {
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            };
        } else if (year) {
            // Entire year
            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31, 23, 59, 59);
            dateFilter = {
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            };
        }

        // Fetch sales orders with filter
        const salesOrders = await prisma.salesOrder.findMany({
            where: dateFilter,
            include: {
                lines: {
                    include: { item: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch production runs with filter
        const productionRuns = await prisma.productionRun.findMany({
            where: dateFilter,
            include: { item: true }
        });

        // Fetch purchase orders with filter
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            where: dateFilter,
            include: {
                lines: {
                    include: { item: true }
                }
            }
        });

        // Calculate Revenue (from sales)
        let totalRevenue = 0;
        let totalCOGS = 0; // Cost of Goods Sold

        salesOrders.forEach(so => {
            so.lines.forEach(line => {
                totalRevenue += line.quantity * line.unitPrice;
                // COGS is the cost of items sold
                if (line.item) {
                    totalCOGS += line.quantity * line.item.cost;
                }
            });
        });

        // Calculate Production Costs
        let totalProductionCost = 0;
        productionRuns.forEach(run => {
            if (run.item) {
                totalProductionCost += run.quantity * run.item.cost;
            }
        });

        // Calculate Purchase Costs (received items)
        let totalPurchaseCost = 0;
        purchaseOrders.forEach(po => {
            po.lines.forEach(line => {
                // Only count received items
                totalPurchaseCost += line.received * line.unitCost;
            });
        });

        // Calculate Operating Expenses (simplified - could be expanded)
        const operatingExpenses = 0; // Placeholder for future expense tracking

        // P&L Calculations
        const grossProfit = totalRevenue - totalCOGS;
        const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const netProfit = grossProfit - operatingExpenses;
        const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        // Monthly breakdown if viewing a full year
        let monthlyBreakdown: any[] = [];

        if (year && !month) {
            // Generate monthly data for the year
            for (let m = 1; m <= 12; m++) {
                const monthStart = new Date(year, m - 1, 1);
                const monthEnd = new Date(year, m, 0, 23, 59, 59);

                const monthSales = await prisma.salesOrder.findMany({
                    where: {
                        createdAt: {
                            gte: monthStart,
                            lte: monthEnd
                        }
                    },
                    include: {
                        lines: {
                            include: { item: true }
                        }
                    }
                });

                let monthRevenue = 0;
                let monthCOGS = 0;

                monthSales.forEach(so => {
                    so.lines.forEach(line => {
                        monthRevenue += line.quantity * line.unitPrice;
                        if (line.item) {
                            monthCOGS += line.quantity * line.item.cost;
                        }
                    });
                });

                const monthProfit = monthRevenue - monthCOGS;

                monthlyBreakdown.push({
                    month: m,
                    monthName: new Date(year, m - 1).toLocaleString('default', { month: 'long' }),
                    revenue: monthRevenue,
                    cogs: monthCOGS,
                    profit: monthProfit,
                    margin: monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0
                });
            }
        }

        return {
            success: true,
            data: {
                period: month ? `${new Date(year!, month - 1).toLocaleString('default', { month: 'long' })} ${year}` : year ? `Year ${year}` : 'All Time',
                revenue: totalRevenue,
                cogs: totalCOGS,
                grossProfit,
                grossMargin,
                operatingExpenses,
                netProfit,
                netMargin,
                productionCost: totalProductionCost,
                purchaseCost: totalPurchaseCost,
                salesCount: salesOrders.length,
                productionCount: productionRuns.length,
                monthlyBreakdown
            }
        };
    } catch (error) {
        console.error('P&L Report error:', error);
        return { success: false, error: 'Failed to generate P&L report' };
    }
}
