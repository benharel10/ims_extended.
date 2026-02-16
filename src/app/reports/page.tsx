'use client'

import React, { useEffect, useState } from 'react';
import { BarChart3, FileText, Package, LayoutList, Download, TrendingUp, AlertTriangle, Warehouse, DollarSign, ShoppingCart, Calculator } from 'lucide-react';
import { getInventoryValuation, getSalesPerformance, getProductionReport, getPurchaseOrderReport, getLowStockReport, getWarehouseComparison, getReportSummary, getProfitLossReport } from './actions';
import { getFinancialDataForChart } from '../finance/actions';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';

export default function ReportsPage() {
    const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'production' | 'purchasing' | 'lowstock' | 'warehouses' | 'profitloss'>('inventory');

    // Data States
    const [inventoryData, setInventoryData] = useState<any[]>([]);
    const [salesData, setSalesData] = useState<any[]>([]);
    const [productionData, setProductionData] = useState<any[]>([]);
    const [purchasingData, setPurchasingData] = useState<any[]>([]);
    const [lowStockData, setLowStockData] = useState<any[]>([]);
    const [warehouseData, setWarehouseData] = useState<any[]>([]);
    const [profitLossData, setProfitLossData] = useState<any>(null);
    const [summary, setSummary] = useState<any>(null);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // P&L Filters
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = all year

    useEffect(() => {
        loadSummary();
    }, []);

    useEffect(() => {
        loadReport(activeTab);
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'profitloss') {
            loadProfitLoss();
        }
    }, [selectedYear, selectedMonth, activeTab]);

    async function loadSummary() {
        const res = await getReportSummary();
        if (res.success) setSummary(res.data);
    }

    async function loadReport(tab: string) {
        setLoading(true);
        if (tab === 'inventory' && inventoryData.length === 0) {
            const res = await getInventoryValuation();
            if (res.success) setInventoryData(res.data || []);
        } else if (tab === 'sales' && salesData.length === 0) {
            const [salesRes, chartRes] = await Promise.all([
                getSalesPerformance(),
                getFinancialDataForChart()
            ]);
            if (salesRes.success) setSalesData(salesRes.data || []);
            if (chartRes.success) setChartData(chartRes.data || []);
        } else if (tab === 'production' && productionData.length === 0) {
            const res = await getProductionReport();
            if (res.success) setProductionData(res.data || []);
        } else if (tab === 'purchasing' && purchasingData.length === 0) {
            const res = await getPurchaseOrderReport();
            if (res.success) setPurchasingData(res.data || []);
        } else if (tab === 'lowstock' && lowStockData.length === 0) {
            const res = await getLowStockReport();
            if (res.success) setLowStockData(res.data || []);
        } else if (tab === 'warehouses' && warehouseData.length === 0) {
            const res = await getWarehouseComparison();
            if (res.success) setWarehouseData(res.data || []);
        }
        setLoading(false);
    }

    async function loadProfitLoss() {
        setLoading(true);
        const res = await getProfitLossReport(selectedYear, selectedMonth || undefined);
        if (res.success) {
            setProfitLossData(res.data);
        }
        setLoading(false);
    }

    function exportToExcel() {
        const wb = XLSX.utils.book_new();

        // Export current tab
        if (activeTab === 'inventory' && inventoryData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(inventoryData);
            XLSX.utils.book_append_sheet(wb, ws, "Inventory");
        } else if (activeTab === 'sales' && salesData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(salesData);
            XLSX.utils.book_append_sheet(wb, ws, "Sales");
        } else if (activeTab === 'production' && productionData.length > 0) {
            const data = productionData.map(r => ({
                ID: r.id,
                Date: new Date(r.createdAt).toLocaleDateString(),
                SKU: r.item?.sku,
                Product: r.item?.name,
                Quantity: r.quantity,
                Value: r.valueProduced,
                Status: r.status
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Production");
        } else if (activeTab === 'purchasing' && purchasingData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(purchasingData);
            XLSX.utils.book_append_sheet(wb, ws, "Purchase Orders");
        } else if (activeTab === 'lowstock' && lowStockData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(lowStockData);
            XLSX.utils.book_append_sheet(wb, ws, "Low Stock");
        } else if (activeTab === 'warehouses' && warehouseData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(warehouseData);
            XLSX.utils.book_append_sheet(wb, ws, "Warehouses");
        } else if (activeTab === 'profitloss' && profitLossData) {
            // P&L Statement
            const plStatement = [
                { Item: 'Period', Value: profitLossData.period },
                { Item: '', Value: '' },
                { Item: 'Revenue', Value: profitLossData.revenue },
                { Item: 'Sales Orders', Value: profitLossData.salesCount },
                { Item: '', Value: '' },
                { Item: 'Cost of Goods Sold (COGS)', Value: profitLossData.cogs },
                { Item: '', Value: '' },
                { Item: 'Gross Profit', Value: profitLossData.grossProfit },
                { Item: 'Gross Margin %', Value: profitLossData.grossMargin },
                { Item: '', Value: '' },
                { Item: 'Operating Expenses', Value: profitLossData.operatingExpenses },
                { Item: '', Value: '' },
                { Item: 'Net Profit', Value: profitLossData.netProfit },
                { Item: 'Net Margin %', Value: profitLossData.netMargin },
                { Item: '', Value: '' },
                { Item: 'Production Cost', Value: profitLossData.productionCost },
                { Item: 'Production Runs', Value: profitLossData.productionCount },
                { Item: 'Purchase Cost', Value: profitLossData.purchaseCost },
            ];
            const ws1 = XLSX.utils.json_to_sheet(plStatement);
            XLSX.utils.book_append_sheet(wb, ws1, "P&L Statement");

            // Monthly breakdown if available
            if (profitLossData.monthlyBreakdown && profitLossData.monthlyBreakdown.length > 0) {
                const ws2 = XLSX.utils.json_to_sheet(profitLossData.monthlyBreakdown);
                XLSX.utils.book_append_sheet(wb, ws2, "Monthly Breakdown");
            }
        }

        const timestamp = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `${activeTab}_report_${timestamp}.xlsx`);
    }

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Reports & Analytics</h1>
                    <p>Comprehensive business intelligence and insights.</p>
                </div>
                <button className="btn btn-outline" onClick={exportToExcel} disabled={loading}>
                    <Download size={16} /> Export to Excel
                </button>
            </div>

            {/* Summary Cards */}
            {summary && (
                <div className="grid-cols-4" style={{ marginBottom: '2rem' }}>
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                            <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                <DollarSign size={20} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>${summary.totalInventoryValue.toLocaleString()}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Inventory Value</div>
                    </div>
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                            <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                                <AlertTriangle size={20} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.lowStockCount}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Low Stock Items</div>
                    </div>
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                            <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                <ShoppingCart size={20} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.pendingPOs}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Pending POs</div>
                    </div>
                    <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                            <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                                <TrendingUp size={20} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>${summary.totalRevenue.toLocaleString()}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Total Revenue</div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <button
                    className={`btn ${activeTab === 'inventory' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('inventory')}
                >
                    <Package size={16} /> Inventory Value
                </button>
                <button
                    className={`btn ${activeTab === 'lowstock' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('lowstock')}
                >
                    <AlertTriangle size={16} /> Low Stock
                </button>
                <button
                    className={`btn ${activeTab === 'purchasing' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('purchasing')}
                >
                    <FileText size={16} /> Purchase Orders
                </button>
                <button
                    className={`btn ${activeTab === 'sales' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('sales')}
                >
                    <BarChart3 size={16} /> Sales
                </button>
                <button
                    className={`btn ${activeTab === 'production' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('production')}
                >
                    <LayoutList size={16} /> Production
                </button>
                <button
                    className={`btn ${activeTab === 'warehouses' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('warehouses')}
                >
                    <Warehouse size={16} /> Warehouses
                </button>
                <button
                    className={`btn ${activeTab === 'profitloss' ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', borderBottom: 'none' }}
                    onClick={() => setActiveTab('profitloss')}
                >
                    <Calculator size={16} /> Profit & Loss
                </button>
            </div>

            {/* Content */}
            <div className="card">
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading report data...</div>
                ) : (
                    <>
                        {/* Inventory Tab */}
                        {activeTab === 'inventory' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem' }}>Inventory Valuation Report</h3>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>SKU</th>
                                                <th style={{ padding: '0.75rem' }}>Name</th>
                                                <th style={{ padding: '0.75rem' }}>Type</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Stock</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Unit Cost</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {inventoryData.map((item, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem' }}>{item.sku}</td>
                                                    <td style={{ padding: '0.75rem' }}>{item.name}</td>
                                                    <td style={{ padding: '0.75rem' }}>{item.type}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.quantity}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>${item.unitCost.toFixed(2)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>${item.totalValue.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Low Stock Tab */}
                        {activeTab === 'lowstock' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem' }}>Low Stock Alert Report</h3>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>Urgency</th>
                                                <th style={{ padding: '0.75rem' }}>SKU</th>
                                                <th style={{ padding: '0.75rem' }}>Name</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Current</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Min Stock</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Deficit</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Deficit Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lowStockData.map((item, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        <span className={`badge ${item.urgency === 'Critical' ? 'badge-danger' : item.urgency === 'High' ? 'badge-warning' : 'badge-neutral'}`}>
                                                            {item.urgency}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem' }}>{item.sku}</td>
                                                    <td style={{ padding: '0.75rem' }}>{item.name}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', color: item.currentStock === 0 ? '#ef4444' : 'inherit' }}>{item.currentStock}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{item.minStock}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>{item.deficit}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>${item.deficitValue.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Purchase Orders Tab */}
                        {activeTab === 'purchasing' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem' }}>Purchase Order Tracking</h3>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>PO Number</th>
                                                <th style={{ padding: '0.75rem' }}>Supplier</th>
                                                <th style={{ padding: '0.75rem' }}>Date</th>
                                                <th style={{ padding: '0.75rem' }}>Status</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Items</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Ordered</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Received</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Completion</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {purchasingData.map((po, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>{po.poNumber}</td>
                                                    <td style={{ padding: '0.75rem' }}>{po.supplier}</td>
                                                    <td style={{ padding: '0.75rem' }}>{new Date(po.createdAt).toLocaleDateString()}</td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        <span className={`badge ${po.status === 'Completed' ? 'badge-success' : po.status === 'Partial' ? 'badge-warning' : 'badge-neutral'}`}>
                                                            {po.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{po.itemCount}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{po.totalOrdered}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{po.totalReceived}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                            <div style={{ width: '60px', height: '6px', background: 'var(--bg-dark)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${po.completionPercent}%`, height: '100%', background: po.completionPercent === 100 ? '#10b981' : '#3b82f6', transition: 'width 0.3s' }} />
                                                            </div>
                                                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{po.completionPercent.toFixed(0)}%</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>${po.totalValue.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Sales Tab */}
                        {activeTab === 'sales' && (
                            <>
                                <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <TrendingUp size={20} /> Financial Overview
                                    </h3>
                                    <div style={{ height: '300px', width: '100%' }}>
                                        {chartData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={chartData}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
                                                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                                                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(value: number) => `$${value}`} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'white' }}
                                                        itemStyle={{ color: 'white' }}
                                                        formatter={(value: any) => [`$${value?.toLocaleString()}`, ''] as [string, string]}
                                                    />
                                                    <Legend />
                                                    <Bar dataKey="Revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="Costs" fill="#ef4444" name="Costs" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="Profit" fill="#10b981" name="Net Profit" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                                No financial trend data available.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <h3 style={{ marginBottom: '1rem' }}>Sales Performance</h3>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>SO Number</th>
                                                <th style={{ padding: '0.75rem' }}>Customer</th>
                                                <th style={{ padding: '0.75rem' }}>Date</th>
                                                <th style={{ padding: '0.75rem' }}>Status</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Revenue</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Est. Cost</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Margin</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {salesData.map((order, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem' }}>{order.soNumber}</td>
                                                    <td style={{ padding: '0.75rem' }}>{order.customer}</td>
                                                    <td style={{ padding: '0.75rem' }}>{new Date(order.date).toLocaleDateString()}</td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        <span className={`badge ${order.status === 'Confirmed' ? 'badge-success' : 'badge-neutral'}`}>
                                                            {order.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>${order.totalValue.toFixed(2)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>${order.totalCost.toFixed(2)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', color: order.margin >= 0 ? '#10b981' : '#ef4444' }}>
                                                        ${order.margin.toFixed(2)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* Production Tab */}
                        {activeTab === 'production' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem' }}>Production History</h3>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>Date</th>
                                                <th style={{ padding: '0.75rem' }}>SKU</th>
                                                <th style={{ padding: '0.75rem' }}>Product Name</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Qty</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Value</th>
                                                <th style={{ padding: '0.75rem' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {productionData.map((run, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem' }}>{new Date(run.createdAt).toLocaleDateString()}</td>
                                                    <td style={{ padding: '0.75rem' }}>{run.item?.sku}</td>
                                                    <td style={{ padding: '0.75rem' }}>{run.item?.name}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{run.quantity}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>${run.valueProduced?.toFixed(2)}</td>
                                                    <td style={{ padding: '0.75rem' }}>{run.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Warehouses Tab */}
                        {activeTab === 'warehouses' && (
                            <div>
                                <h3 style={{ marginBottom: '1rem' }}>Warehouse Comparison</h3>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>Warehouse</th>
                                                <th style={{ padding: '0.75rem' }}>Location</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Unique Items</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Units</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Value</th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Avg Value/Item</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {warehouseData.map((wh, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>{wh.name}</td>
                                                    <td style={{ padding: '0.75rem' }}>{wh.location}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{wh.totalItems}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{wh.totalUnits}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600 }}>${wh.totalValue.toFixed(2)}</td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>${wh.avgValuePerItem.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Profit & Loss Tab */}
                        {activeTab === 'profitloss' && profitLossData && (
                            <div>
                                {/* Filters */}
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Year</label>
                                        <select
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                            style={{
                                                padding: '0.75rem',
                                                background: 'var(--bg-dark)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--text-main)',
                                                minWidth: '120px'
                                            }}
                                        >
                                            {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500 }}>Month</label>
                                        <select
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                            style={{
                                                padding: '0.75rem',
                                                background: 'var(--bg-dark)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--text-main)',
                                                minWidth: '150px'
                                            }}
                                        >
                                            <option value={0}>Full Year</option>
                                            {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, idx) => (
                                                <option key={idx + 1} value={idx + 1}>{month}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Period</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{profitLossData.period}</div>
                                    </div>
                                </div>

                                {/* P&L Statement */}
                                <div style={{ background: 'var(--bg-dark)', padding: '2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
                                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Calculator size={20} /> Profit & Loss Statement
                                    </h3>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {/* Revenue Section */}
                                        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Revenue</span>
                                                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#3b82f6' }}>
                                                    ${profitLossData.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                From {profitLossData.salesCount} sales orders
                                            </div>
                                        </div>

                                        {/* COGS Section */}
                                        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '1rem' }}>Cost of Goods Sold (COGS)</span>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ef4444' }}>
                                                    ${profitLossData.cogs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Gross Profit */}
                                        <div style={{ paddingBottom: '1rem', borderBottom: '2px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>Gross Profit</span>
                                                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: profitLossData.grossProfit >= 0 ? '#10b981' : '#ef4444' }}>
                                                    ${profitLossData.grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                Gross Margin: {profitLossData.grossMargin.toFixed(1)}%
                                            </div>
                                        </div>

                                        {/* Operating Expenses */}
                                        <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '1rem' }}>Operating Expenses</span>
                                                <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                                    ${profitLossData.operatingExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Net Profit */}
                                        <div style={{ padding: '1rem', background: profitLossData.netProfit >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-md)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Net Profit</span>
                                                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: profitLossData.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                                                    ${profitLossData.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                Net Margin: {profitLossData.netMargin.toFixed(1)}%
                                            </div>
                                        </div>

                                        {/* Additional Metrics */}
                                        <div className="grid-cols-2" style={{ gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                                            <div>
                                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Production Cost</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>${profitLossData.productionCost.toLocaleString()}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{profitLossData.productionCount} production runs</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Purchase Cost</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>${profitLossData.purchaseCost.toLocaleString()}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Received items</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Monthly Breakdown Chart (only for full year view) */}
                                {profitLossData.monthlyBreakdown && profitLossData.monthlyBreakdown.length > 0 && (
                                    <div style={{ background: 'var(--bg-dark)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                        <h3 style={{ marginBottom: '1.5rem' }}>Monthly Breakdown</h3>
                                        <div style={{ height: '350px', width: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart
                                                    data={profitLossData.monthlyBreakdown}
                                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
                                                    <XAxis dataKey="monthName" stroke="var(--text-muted)" fontSize={12} angle={-45} textAnchor="end" height={80} />
                                                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(value: number) => `$${value}`} />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', color: 'white' }}
                                                        itemStyle={{ color: 'white' }}
                                                        formatter={(value: any) => [`$${value?.toLocaleString()}`, ''] as [string, string]}
                                                    />
                                                    <Legend />
                                                    <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="cogs" fill="#ef4444" name="COGS" radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="profit" fill="#10b981" name="Profit" radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>

                                        {/* Monthly Table */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '2rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                                    <th style={{ padding: '0.75rem' }}>Month</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Revenue</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>COGS</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Profit</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Margin %</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {profitLossData.monthlyBreakdown.map((month: any, i: number) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '0.75rem' }}>{month.monthName}</td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>${month.revenue.toLocaleString()}</td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444' }}>${month.cogs.toLocaleString()}</td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: month.profit >= 0 ? '#10b981' : '#ef4444' }}>
                                                            ${month.profit.toLocaleString()}
                                                        </td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{month.margin.toFixed(1)}%</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
