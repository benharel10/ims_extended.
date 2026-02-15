'use client'

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPurchaseOrder, addPOLine, removePOLine, updatePOStatus, getItems } from '../actions';
import { Plus, Trash2, Save, ArrowLeft, Package } from 'lucide-react';
import Link from 'next/link';
import { useSystem } from '@/components/SystemProvider';

export default function PODetailPage() {
    const params = useParams();
    const router = useRouter();
    const { showAlert, showConfirm } = useSystem();
    const poId = parseInt(params.id as string);

    const [po, setPo] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Add Line State
    const [showAddLine, setShowAddLine] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        loadData();
    }, [poId]);

    async function loadData() {
        setLoading(true);
        const [poRes, itemsRes] = await Promise.all([
            getPurchaseOrder(poId),
            getItems()
        ]);

        if (poRes.success && poRes.data) {
            setPo(poRes.data);
        } else {
            showAlert('PO not found', 'error');
            router.push('/purchasing');
        }

        if (itemsRes.success && itemsRes.data) {
            setItems(itemsRes.data);
        }
        setLoading(false);
    }

    async function handleAddLine() {
        if (!selectedItemId || quantity <= 0) {
            showAlert('Select an item and enter quantity', 'warning');
            return;
        }

        const item = items.find(i => i.id === parseInt(selectedItemId));
        if (!item) return;

        const res = await addPOLine(poId, item.id, quantity, item.cost);
        if (res.success) {
            showAlert('Item added to PO', 'success');
            setShowAddLine(false);
            setSelectedItemId('');
            setQuantity(1);
            loadData();
        } else {
            showAlert(res.error || 'Failed to add item', 'error');
        }
    }

    async function handleRemoveLine(lineId: number, itemName: string) {
        showConfirm(`Remove ${itemName} from this PO?`, async () => {
            const res = await removePOLine(lineId);
            if (res.success) {
                showAlert('Line removed', 'success');
                loadData();
            } else {
                showAlert(res.error || 'Failed to remove', 'error');
            }
        });
    }

    async function handleStatusChange(newStatus: string) {
        showConfirm(`Change PO status to ${newStatus}?`, async () => {
            const res = await updatePOStatus(poId, newStatus);
            if (res.success) {
                showAlert('Status updated', 'success');
                loadData();
            } else {
                showAlert(res.error || 'Failed to update', 'error');
            }
        });
    }

    if (loading) {
        return <div className="animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>Loading PO...</div>;
    }

    if (!po) {
        return <div className="animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>PO not found</div>;
    }

    const totalCost = po.lines?.reduce((sum: number, line: any) => sum + (line.quantity * line.unitCost), 0) || 0;
    const totalReceived = po.lines?.reduce((sum: number, line: any) => sum + line.received, 0) || 0;
    const totalOrdered = po.lines?.reduce((sum: number, line: any) => sum + line.quantity, 0) || 0;

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <Link href="/purchasing" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                            <ArrowLeft size={20} />
                        </Link>
                        <h1>{po.poNumber}</h1>
                        <span className={`badge badge-${po.status === 'Completed' ? 'success' : po.status === 'Partial' ? 'warning' : 'secondary'}`}>
                            {po.status}
                        </span>
                    </div>
                    <p>Supplier: <strong>{po.supplier}</strong> • Created: {new Date(po.createdAt).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {po.status === 'Draft' && (
                        <button className="btn btn-outline" onClick={() => handleStatusChange('Sent')}>
                            Mark as Sent
                        </button>
                    )}
                    <Link href="/purchasing/receive" className="btn btn-primary">
                        <Package size={18} />
                        Receive Items
                    </Link>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid-cols-3" style={{ marginBottom: '2rem' }}>
                <div className="card">
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Items</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700 }}>{po.lines?.length || 0}</div>
                </div>
                <div className="card">
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Ordered / Received</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalOrdered} / {totalReceived}</div>
                </div>
                <div className="card">
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Cost</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700 }}>${totalCost.toFixed(2)}</div>
                </div>
            </div>

            {/* PO Lines */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3>Order Lines</h3>
                    {po.status !== 'Completed' && (
                        <button className="btn btn-primary" onClick={() => setShowAddLine(!showAddLine)}>
                            <Plus size={18} />
                            Add Item
                        </button>
                    )}
                </div>

                {/* Add Line Form */}
                {showAddLine && (
                    <div style={{ padding: '1rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 120px', gap: '1rem', alignItems: 'end' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    Item
                                </label>
                                <select
                                    className="input-group"
                                    value={selectedItemId}
                                    onChange={e => setSelectedItemId(e.target.value)}
                                >
                                    <option value="">-- Select Item --</option>
                                    {items.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.sku} - {item.name} (${item.cost.toFixed(2)})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                    Quantity
                                </label>
                                <input
                                    type="number"
                                    className="input-group"
                                    value={quantity}
                                    onChange={e => setQuantity(parseInt(e.target.value))}
                                    min="1"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-primary" onClick={handleAddLine}>
                                    <Save size={16} />
                                    Add
                                </button>
                                <button className="btn btn-outline" onClick={() => setShowAddLine(false)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Lines Table */}
                {po.lines && po.lines.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>SKU</th>
                                <th style={{ padding: '1rem' }}>Item</th>
                                <th style={{ padding: '1rem' }}>Unit Cost</th>
                                <th style={{ padding: '1rem' }}>Quantity</th>
                                <th style={{ padding: '1rem' }}>Received</th>
                                <th style={{ padding: '1rem' }}>Pending</th>
                                <th style={{ padding: '1rem' }}>Subtotal</th>
                                <th style={{ padding: '1rem' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {po.lines.map((line: any) => {
                                const pending = line.quantity - line.received;
                                const isComplete = pending <= 0;
                                return (
                                    <tr key={line.id} style={{ borderBottom: '1px solid var(--border-color)', opacity: isComplete ? 0.6 : 1 }}>
                                        <td style={{ padding: '1rem', fontWeight: 500 }}>{line.item.sku}</td>
                                        <td style={{ padding: '1rem' }}>{line.item.name}</td>
                                        <td style={{ padding: '1rem' }}>${line.unitCost.toFixed(2)}</td>
                                        <td style={{ padding: '1rem' }}>{line.quantity}</td>
                                        <td style={{ padding: '1rem', color: 'var(--success)' }}>{line.received}</td>
                                        <td style={{ padding: '1rem', color: pending > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                                            {pending > 0 ? pending : '✓'}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: 600 }}>${(line.quantity * line.unitCost).toFixed(2)}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {po.status !== 'Completed' && line.received === 0 && (
                                                <button
                                                    onClick={() => handleRemoveLine(line.id, line.item.name)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        padding: '0.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <p>No items in this PO yet. Click "Add Item" to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
