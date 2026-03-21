'use client'

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShoppingCart, RefreshCw, FileText, CheckSquare, Square, Plus, ExternalLink, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { getLowStockItems, generatePurchaseOrder, getOpenPurchaseOrders, createEmptyPO, deletePurchaseOrder, getBrands } from './actions';
import { getSalesOrders } from '@/app/sales/actions';

import { useSystem } from '@/components/SystemProvider';
import { useRouter } from 'next/navigation';

export default function PurchasingPage() {
    const router = useRouter();
    const { showAlert, showConfirm, user } = useSystem();
    const isAdmin = user?.role === 'Admin';
    const [items, setItems] = useState<any[]>([]);
    const [pos, setPos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [quantities, setQuantities] = useState<{ [id: number]: number }>({});
    const [showCreatePO, setShowCreatePO] = useState(false);
    const [newSupplier, setNewSupplier] = useState('');
    const [leadTime, setLeadTime] = useState('');
    const [shippingCost, setShippingCost] = useState('');
    const [salesOrderId, setSalesOrderId] = useState('');
    const [brands, setBrands] = useState<string[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [itemsRes, posRes, brandsRes, soRes] = await Promise.all([
            getLowStockItems(),
            getOpenPurchaseOrders(),
            getBrands(),
            getSalesOrders()
        ]);

        if (itemsRes.success && itemsRes.data) {
            setItems(itemsRes.data);
            // Initialize quantities with suggested values
            const initialQtys: any = {};
            const initialSelection = new Set<number>();
            itemsRes.data.forEach((item: any) => {
                const deficit = item.minStock - item.currentStock;
                const suggested = deficit + Math.ceil(item.minStock * 0.2);
                initialQtys[item.id] = suggested > 0 ? suggested : 1;
                initialSelection.add(item.id); // Auto-select all by default
            });
            setQuantities(initialQtys);
            setSelectedIds(initialSelection);
        }

        if (posRes.success && posRes.data) {
            setPos(posRes.data);
        }
        if (brandsRes.success && brandsRes.data) {
            setBrands(brandsRes.data);
        }
        if (soRes.success && soRes.data) {
            setSalesOrders(soRes.data.filter((so: any) => so.status !== 'Completed' && so.status !== 'Cancelled'));
        }
        setLoading(false);
    }

    function toggleSelect(id: number) {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    }

    function updateQuantity(id: number, qty: number) {
        setQuantities({ ...quantities, [id]: qty });
    }

    async function handleGeneratePO() {
        if (selectedIds.size === 0) {
            showAlert('Select items to order.', 'warning');
            return;
        }

        const orderData = Array.from(selectedIds).map(id => ({
            itemId: id,
            quantity: quantities[id] || 1
        }));

        showConfirm(`Generate PO for ${orderData.length} items?`, async () => {
            const res = await generatePurchaseOrder(orderData);
            if (res.success) {
                showAlert('Purchase Order created successfully (Draft).', 'success');
                loadData();
            } else {
                showAlert(res.error || 'Failed to create PO', 'error');
            }
        });
    }

    async function handleCreateEmptyPO() {
        if (!newSupplier) {
            showAlert('Enter supplier name', 'warning');
            return;
        }

        const days = leadTime ? parseInt(leadTime) : undefined;
        const shipping = shippingCost ? parseFloat(shippingCost) : undefined;
        const soId = salesOrderId ? parseInt(salesOrderId) : undefined;

        const res = await createEmptyPO(newSupplier, days, shipping, soId);
        if (res.success && res.data) {
            showAlert('PO created', 'success');
            setShowCreatePO(false);
            setNewSupplier('');
            setLeadTime('');
            setShippingCost('');
            setSalesOrderId('');
            router.push(`/purchasing/${res.data.id}`);
        } else {
            showAlert(res.error || 'Failed to create PO', 'error');
        }
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Purchasing & Reordering</h1>
                    <p>Manage purchase orders and track low stock items.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link href="/purchasing/receive" className="btn btn-outline">
                        <CheckSquare size={18} style={{ marginRight: '0.5rem' }} /> Receive Items
                    </Link>
                    <button className="btn btn-outline" onClick={loadData}>
                        <RefreshCw size={18} />
                        Refresh
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowCreatePO(true)}>
                        <Plus size={18} />
                        New Purchase Order
                    </button>
                </div>
            </div>

            {/* Create PO Modal */}
            {showCreatePO && (
                <div className="modal-overlay" onClick={() => setShowCreatePO(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2 style={{ marginBottom: '1.5rem' }}>Create New Purchase Order</h2>
                        <div className="form-group">
                            <label>Supplier Name (From Brands)</label>
                            <select
                                className="input-group"
                                value={newSupplier}
                                onChange={e => setNewSupplier(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            >
                                <option value="">Select a brand/supplier</option>
                                {brands.map((b, i) => (
                                    <option key={i} value={b}>{b}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Link to Sales Order (Optional)</label>
                            <select
                                className="input-group"
                                value={salesOrderId}
                                onChange={e => setSalesOrderId(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                            >
                                <option value="">None</option>
                                {salesOrders.map(so => (
                                    <option key={so.id} value={so.id}>{so.soNumber} - {so.customer}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Expected Lead Time (Days)</label>
                                <input
                                    type="number"
                                    className="input-group"
                                    placeholder="e.g. 14"
                                    value={leadTime}
                                    onChange={e => setLeadTime(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Shipping Cost</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input-group"
                                    placeholder="e.g. 50.00"
                                    value={shippingCost}
                                    onChange={e => setShippingCost(e.target.value)}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button className="btn btn-outline" onClick={() => setShowCreatePO(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleCreateEmptyPO}>
                                Create PO
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Active Purchase Orders */}
            <div className="card" style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Active Purchase Orders</h3>
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                ) : pos.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No active purchase orders. Create one to get started.
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem' }}>PO Number</th>
                                    <th style={{ padding: '1rem' }}>Supplier</th>
                                    <th style={{ padding: '1rem' }}>Status</th>
                                    <th style={{ padding: '1rem' }}>Items</th>
                                    <th style={{ padding: '1rem' }}>Created</th>
                                    <th style={{ padding: '1rem' }}>Due Date</th>
                                    <th style={{ padding: '1rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pos.map(po => (
                                    <tr key={po.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '1rem', fontWeight: 600 }}>{po.poNumber}</td>
                                        <td style={{ padding: '1rem' }}>{po.supplier}</td>
                                        <td style={{ padding: '1rem' }}>
                                            <span className={`badge badge-${po.status === 'Completed' ? 'success' : po.status === 'Partial' ? 'warning' : 'secondary'}`}>
                                                {po.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>{po.lines?.length || 0}</td>
                                        <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                                            {new Date(po.createdAt).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {(() => {
                                                if (!po.leadTimeDays) return <span style={{ color: 'var(--text-muted)' }}>-</span>;
                                                const due = new Date(new Date(po.createdAt).setDate(new Date(po.createdAt).getDate() + po.leadTimeDays));
                                                const isOverdue = new Date() > due && po.status !== 'Completed';
                                                return (
                                                    <span style={{
                                                        color: isOverdue ? 'var(--error)' : 'inherit',
                                                        fontWeight: isOverdue ? 600 : 400,
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                                    }}>
                                                        {due.toLocaleDateString()}
                                                        {isOverdue && <AlertTriangle size={14} />}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <Link href={`/purchasing/${po.id}`} className="btn btn-outline" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                                                    <ExternalLink size={14} style={{ marginRight: '0.5rem' }} />
                                                    View Details
                                                </Link>
                                                {isAdmin && (
                                                    <button
                                                        className="btn btn-outline"
                                                        style={{ padding: '0.5rem', borderColor: '#ef4444', color: '#ef4444' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            showConfirm(`Are you sure you want to delete PO ${po.poNumber}? This action cannot be undone.`, async () => {
                                                                const res = await deletePurchaseOrder(po.id);
                                                                if (res.success) {
                                                                    showAlert('Purchase Order deleted successfully', 'success');
                                                                    loadData();
                                                                } else {
                                                                    showAlert(res.error || 'Failed to delete PO', 'error');
                                                                }
                                                            });
                                                        }}
                                                        title="Delete Purchase Order"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Low Stock Items - Quick Reorder */}
            <div className="card">
                <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
                        <AlertTriangle size={20} />
                        <span style={{ fontWeight: 500 }}>{items.length} items require attention</span>
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={handleGeneratePO}
                        disabled={selectedIds.size === 0}
                    >
                        <FileText size={18} />
                        Generate PO ({selectedIds.size})
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading report...</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', opacity: 0.5 }}>
                            <ShoppingCart size={48} />
                        </div>
                        <h3>All Stock Levels Healthy</h3>
                        <p>No items are currently below their minimum stock level.</p>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                    <th style={{ padding: '1rem', width: '40px' }}>
                                        <div
                                            className="checkbox"
                                            onClick={() => {
                                                if (selectedIds.size === items.length) setSelectedIds(new Set());
                                                else setSelectedIds(new Set(items.map(i => i.id)));
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            {selectedIds.size === items.length && items.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </div>
                                    </th>
                                    <th style={{ padding: '1rem' }}>SKU</th>
                                    <th style={{ padding: '1rem' }}>Name</th>
                                    <th style={{ padding: '1rem' }}>Current Stock</th>
                                    <th style={{ padding: '1rem' }}>Min Stock</th>
                                    <th style={{ padding: '1rem' }}>Deficit</th>
                                    <th style={{ padding: '1rem' }}>Order Qty</th>
                                    <th style={{ padding: '1rem' }}>Cost Est.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const deficit = item.minStock - item.currentStock;
                                    return (
                                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)', background: selectedIds.has(item.id) ? 'rgba(7, 89, 133, 0.1)' : 'transparent' }}>
                                            <td style={{ padding: '1rem' }}>
                                                <div
                                                    className="checkbox"
                                                    onClick={() => toggleSelect(item.id)}
                                                    style={{ cursor: 'pointer', color: selectedIds.has(item.id) ? 'var(--primary)' : 'var(--text-muted)' }}
                                                >
                                                    {selectedIds.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem', fontWeight: 500 }}>{item.sku}</td>
                                            <td style={{ padding: '1rem' }}>{item.name}</td>
                                            <td style={{ padding: '1rem', color: '#ef4444', fontWeight: 600 }}>{item.currentStock}</td>
                                            <td style={{ padding: '1rem' }}>{item.minStock}</td>
                                            <td style={{ padding: '1rem' }}>{deficit}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <input
                                                    type="number"
                                                    className="input-group"
                                                    style={{ width: '80px', padding: '0.25rem' }}
                                                    value={quantities[item.id] || 0}
                                                    onChange={(e) => updateQuantity(item.id, parseInt(e.target.value))}
                                                    min="1"
                                                />
                                            </td>
                                            <td style={{ padding: '1rem' }}>${((quantities[item.id] || 0) * item.cost).toFixed(2)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
