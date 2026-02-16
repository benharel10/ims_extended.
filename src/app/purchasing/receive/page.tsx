'use client'

import React, { useState, useEffect } from 'react';
import { getOpenPurchaseOrders, receivePOItems, getWarehouses } from '../actions';
import { PackageCheck, ChevronDown, ChevronRight, Save } from 'lucide-react';
import Link from 'next/link';

import { useSystem } from '@/components/SystemProvider';

export default function ReceivePOPage() {
    const { showAlert, showConfirm } = useSystem();
    const [pos, setPos] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedPo, setExpandedPo] = useState<number | null>(null);
    const [receiveQtys, setReceiveQtys] = useState<{ [lineId: number]: number }>({});
    const [selectedWarehouses, setSelectedWarehouses] = useState<{ [poId: number]: string }>({});

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [posRes, whRes] = await Promise.all([
            getOpenPurchaseOrders(),
            getWarehouses()
        ]);

        if (posRes.success && posRes.data) {
            setPos(posRes.data);
        }
        if (whRes.success && whRes.data) {
            setWarehouses(whRes.data);
            // Default to first warehouse for all POs? Or let user pick.
            // Let's not pre-select to force user choice, or select first one.
            if (whRes.data.length > 0) {
                // We'll leave it empty and enforce selection, or just optional?
                // Better UX: select Main Warehouse if exists, or first one.
            }
        }
        setLoading(false);
    }

    function toggleExpand(id: number) {
        if (expandedPo === id) setExpandedPo(null);
        else setExpandedPo(id);
    }

    function updateQty(lineId: number, qty: number) {
        setReceiveQtys({ ...receiveQtys, [lineId]: qty });
    }

    async function handleReceive(poId: number) {
        const warehouseId = selectedWarehouses[poId];

        if (!warehouseId) {
            showAlert('Please select a destination warehouse.', 'warning');
            return;
        }

        // Collect items to receive
        const itemsToReceive: { lineId: number, qty: number }[] = [];
        const po = pos.find(p => p.id === poId);
        if (!po) return;

        po.lines.forEach((line: any) => {
            const qty = receiveQtys[line.id];
            if (qty && qty > 0) {
                itemsToReceive.push({ lineId: line.id, qty });
            }
        });

        if (itemsToReceive.length === 0) {
            showAlert('Enter quantity to receive.', 'warning');
            return;
        }

        const warehouseName = warehouses.find(w => w.id === parseInt(warehouseId))?.name || 'Warehouse';
        showConfirm(`Receive ${itemsToReceive.length} line items into ${warehouseName}? Stock will be updated.`, async () => {
            const res = await receivePOItems(poId, itemsToReceive, parseInt(warehouseId));
            if (res.success) {
                showAlert('Items received successfully', 'success');
                setReceiveQtys({}); // Clear
                loadData();
            } else {
                showAlert('Failed to receive: ' + res.error, 'error');
            }
        });
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Receive Purchase Orders</h1>
                    <p>Process incoming shipments from suppliers.</p>
                </div>
                <Link href="/purchasing" className="btn btn-outline">
                    Back to Purchasing
                </Link>
            </div>

            {loading ? (
                <div>Loading...</div>
            ) : pos.length === 0 ? (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <PackageCheck size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
                    <h3>No Open POs</h3>
                    <p>There are no purchase orders pending receipt.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {pos.map(po => {
                        const isExpanded = expandedPo === po.id;
                        return (
                            <div key={po.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div
                                    onClick={() => toggleExpand(po.id)}
                                    style={{
                                        padding: '1rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        background: isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent'
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{po.poNumber}</span>
                                        <span className="badge badge-primary">{po.supplier}</span>
                                        <span className={`badge badge-${po.status === 'Partial' ? 'warning' : 'secondary'}`}>{po.status}</span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        {new Date(po.createdAt).toLocaleDateString()}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', background: 'var(--bg-dark)' }}>
                                        <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                Destination Warehouse:
                                            </label>
                                            <select
                                                className="input-group"
                                                style={{ maxWidth: '300px' }}
                                                value={selectedWarehouses[po.id] || ''}
                                                onChange={e => setSelectedWarehouses({ ...selectedWarehouses, [po.id]: e.target.value })}
                                            >
                                                <option value="">-- Select Warehouse --</option>
                                                {warehouses.map(w => (
                                                    <option key={w.id} value={w.id}>{w.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                                                    <th style={{ padding: '0.5rem' }}>Item</th>
                                                    <th style={{ padding: '0.5rem' }}>Ordered</th>
                                                    <th style={{ padding: '0.5rem' }}>Received So Far</th>
                                                    <th style={{ padding: '0.5rem' }}>Pending</th>
                                                    <th style={{ padding: '0.5rem' }}>Receive Now</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {po.lines.map((line: any) => {
                                                    const pending = line.quantity - line.received;
                                                    const isComplete = pending <= 0;

                                                    return (
                                                        <tr key={line.id} style={{ opacity: isComplete ? 0.5 : 1 }}>
                                                            <td style={{ padding: '0.5rem' }}>
                                                                {line.item?.sku || line.newItemSku || <span style={{ opacity: 0.7 }}>New Item</span>} - {line.item?.name || line.newItemName}
                                                            </td>
                                                            <td style={{ padding: '0.5rem' }}>{line.quantity}</td>
                                                            <td style={{ padding: '0.5rem' }}>{line.received}</td>
                                                            <td style={{ padding: '0.5rem' }}>{Math.max(0, pending)}</td>
                                                            <td style={{ padding: '0.5rem' }}>
                                                                {!isComplete && (
                                                                    <input
                                                                        type="number"
                                                                        className="input-group"
                                                                        style={{ width: '80px', padding: '0.25rem' }}
                                                                        placeholder="Qty"
                                                                        max={pending}
                                                                        min="0"
                                                                        value={receiveQtys[line.id] || ''}
                                                                        onChange={e => updateQty(line.id, parseInt(e.target.value))}
                                                                    />
                                                                )}
                                                                {isComplete && <span className="text-muted">Complete</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-primary"
                                                onClick={(e) => { e.stopPropagation(); handleReceive(po.id); }}
                                                disabled={!selectedWarehouses[po.id]}
                                            >
                                                <Save size={16} style={{ marginRight: '0.5rem' }} /> Process Receipt
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
