'use client'

import React, { useEffect, useState } from 'react';
import { DollarSign, RefreshCw, Activity, Layers, ArrowUpRight, TrendingUp } from 'lucide-react';
import { getFinancialSummary, getSyncLogs, getFinancialDataForChart } from './actions';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function FinancePage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [summary, setSummary] = useState({ rawMaterialValue: 0, finishedGoodsValue: 0, totalInventoryValue: 0 });
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [logRes, sumRes, chartRes] = await Promise.all([
            getSyncLogs(),
            getFinancialSummary(),
            getFinancialDataForChart()
        ]);

        if (logRes.success) setLogs(logRes.data || []);
        if (sumRes.success) setSummary(sumRes.data || { rawMaterialValue: 0, finishedGoodsValue: 0, totalInventoryValue: 0 });
        if (chartRes.success) setChartData(chartRes.data || []);
        setLoading(false);
    }

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '2rem' }}>
                <h1>Finance & Integration</h1>
                <p>Monitor financial value and iCount synchronization status.</p>
            </div>

            {/* Dashboard Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        <DollarSign size={16} /> Total Inventory Value
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#10b981' }}>
                        ${summary.totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        <Layers size={16} /> Raw Materials Value
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                        ${summary.rawMaterialValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        <PackageIcon /> Finished Goods Value
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>
                        ${summary.finishedGoodsValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            {/* Financial Performance Chart */}
            <div className="card" style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={20} /> Financial Performance
                </h3>
                <div style={{ height: '300px', width: '100%' }}>
                    {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={chartData}
                                margin={{
                                    top: 5,
                                    right: 30,
                                    left: 20,
                                    bottom: 5,
                                }}
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                            No financial data available yet. Confirm some sales orders to see trends.
                        </div>
                    )}
                </div>
            </div>

            {/* Sync Logs */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Activity size={20} /> iCount Sync Logs
                    </h3>
                    <button onClick={loadData} className="btn btn-ghost" title="Refresh Logs">
                        <RefreshCw size={16} />
                    </button>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                <th style={{ padding: '0.75rem' }}>Time</th>
                                <th style={{ padding: '0.75rem' }}>Entity</th>
                                <th style={{ padding: '0.75rem' }}>Full ID/Ref</th>
                                <th style={{ padding: '0.75rem' }}>Action</th>
                                <th style={{ padding: '0.75rem' }}>Status</th>
                                <th style={{ padding: '0.75rem' }}>Message</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No logs found.</td></tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>{log.entityType}</td>
                                        <td style={{ padding: '0.75rem' }}>#{log.entityId}</td>
                                        <td style={{ padding: '0.75rem' }}>{log.action}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{
                                                color: log.status === 'Success' ? '#10b981' : '#ef4444',
                                                fontWeight: 500
                                            }}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{log.message}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function PackageIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22v-10" /></svg>
    )
}
