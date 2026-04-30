'use client'

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShoppingCart, RefreshCw, FileText, CheckSquare, Square, Plus, ExternalLink, Trash2, Link2 } from 'lucide-react';
import Link from 'next/link';
import { getLowStockItems, generatePurchaseOrder, getPurchaseOrders, createEmptyPO, deletePurchaseOrder, deleteMultiplePOs, updatePODueDate, getBrands } from './actions';
import { getSalesOrders } from '@/app/sales/actions';

import { useSystem } from '@/components/SystemProvider';
import { useRouter } from 'next/navigation';


function EditableDueCell({ po, onUpdate }: any) {
    const [dateVal, setDateVal] = useState(po.dueDate ? new Date(po.dueDate).toISOString().split('T')[0] : '');

    useEffect(() => {
        setDateVal(po.dueDate ? new Date(po.dueDate).toISOString().split('T')[0] : '');
    }, [po.dueDate]);

    return (
        <input 
            type="date" 
            className="input-group" 
            style={{ 
                padding: '0.25rem 0.5rem', 
                width: '130px', 
                margin: 0, 
                fontSize: '0.875rem',
                border: !dateVal ? '1px dashed #f87171' : '1px solid var(--border-color)',
                backgroundColor: !dateVal ? 'rgba(248, 113, 113, 0.05)' : 'transparent'
            }} 
            value={dateVal} 
            onChange={e => setDateVal(e.target.value)}
            onBlur={() => {
                const current = po.dueDate ? new Date(po.dueDate).toISOString().split('T')[0] : '';
                if (dateVal !== current && dateVal !== '') {
                    onUpdate(po.id, dateVal);
                }
            }}
        />
    );
}

export default function PurchasingPage() {
    const router = useRouter();
    const { showAlert, showConfirm, user } = useSystem();
    const isAdmin = user?.role === 'Admin';
    const [items, setItems] = useState<any[]>([]);
    const [pos, setPos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [selectedPoIds, setSelectedPoIds] = useState<Set<number>>(new Set());
    const [quantities, setQuantities] = useState<{ [id: number]: number }>({});
    const [showCreatePO, setShowCreatePO] = useState(false);
    const [newSupplier, setNewSupplier] = useState('');
    const [leadTime, setLeadTime] = useState('');
    const [shippingCost, setShippingCost] = useState('');
    const [salesOrderId, setSalesOrderId] = useState('');
    const [brands, setBrands] = useState<string[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [poSearch, setPoSearch] = useState('');
    const [dueTodayPOs, setDueTodayPOs] = useState<any[]>([]);
    const [showDuePrompt, setShowDuePrompt] = useState(false);
    const [duePromptIndex, setDuePromptIndex] = useState(0);
    const [includeCompleted, setIncludeCompleted] = useState(false);
    const [poDueDate, setPoDueDate] = useState('');

    useEffect(() => {
        loadData();
    }, [includeCompleted]);

    async function loadData() {
        setLoading(true);
        const [itemsRes, posRes, brandsRes, soRes] = await Promise.all([
            getLowStockItems(),
            getPurchaseOrders(includeCompleted),
            getBrands(),
            getSalesOrders()
        ]);

        if (itemsRes.success && itemsRes.data) {
            setItems(itemsRes.data);
            const initialQtys: any = {};
            const initialSelection = new Set<number>();
            itemsRes.data.forEach((item: any) => {
                const deficit = item.minStock - item.currentStock;
                const suggested = deficit + Math.ceil(item.minStock * 0.2);
                initialQtys[item.id] = suggested > 0 ? suggested : 1;
                initialSelection.add(item.id);
            });
            setQuantities(initialQtys);
            setSelectedIds(initialSelection);
        }

        if (posRes.success && posRes.data) {
            setPos(posRes.data);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const due = posRes.data.filter((po: any) => {
                if (!po.dueDate || (po.status !== 'Sent' && po.status !== 'Partial')) return false;
                const dueDate = new Date(po.dueDate);
                dueDate.setHours(0, 0, 0, 0);
                return dueDate <= today;
            });
            if (due.length > 0) {
                setDueTodayPOs(due);
                setDuePromptIndex(0);
                setShowDuePrompt(true);
            }
        }
        if (brandsRes.success && brandsRes.data) setBrands(brandsRes.data);
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

    function toggleSelectPo(id: number) {
        const newSet = new Set(selectedPoIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedPoIds(newSet);
    }

    async function handleUpdateDueDate(id: number, dateStr: string) {
        const res = await updatePODueDate(id, dateStr);
        if (res.success) loadData();
        else showAlert(res.error || 'Failed to update due date', 'error');
    }


    async function handleDeleteSelectedPOs() {
        showConfirm(`Are you sure you want to delete ${selectedPoIds.size} purchase order(s)?`, async () => {
            const res = await deleteMultiplePOs(Array.from(selectedPoIds));
            if (res.success) {
                showAlert('Purchase Orders deleted', 'success');
                setSelectedPoIds(new Set());
                loadData();
            } else {
                showAlert(res.error || 'Failed to delete POs', 'error');
            }
        });
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
        if (!newSupplier) return showAlert('Please select a supplier', 'error');
        const res = await createEmptyPO(
            newSupplier, 
            leadTime ? parseInt(leadTime) : undefined, 
            shippingCost ? parseFloat(shippingCost) : undefined, 
            salesOrderId ? parseInt(salesOrderId) : undefined,
            undefined, // orderDate (defaults to now in action)
            poDueDate
        );
        if (res.success) {
            setShowCreatePO(false);
            setNewSupplier('');
            setLeadTime('');
            setShippingCost('');
            setSalesOrderId('');
            setPoDueDate('');
            loadData();
            showAlert('Purchase Order created successfully', 'success');
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
                    <Link href="/purchasing/mapper" className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Link2 size={16} /> SKU Mapper
                    </Link>
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
                        <div className="form-group">
                            <label>Due Date (Optional)</label>
                            <input
                                type="date"
                                className="input-group"
                                value={poDueDate}
                                onChange={e => setPoDueDate(e.target.value)}
                                style={{ width: '100%' }}
                            />
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

            {/* Arrival Due Prompt */}
            {showDuePrompt && dueTodayPOs[duePromptIndex] && (
                <div className="modal-overlay" onClick={() => setShowDuePrompt(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
                        <h2 style={{ marginBottom: '0.75rem' }}>Shipment Due!</h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            Purchase Order <strong>{dueTodayPOs[duePromptIndex].poNumber}</strong> from <strong>{dueTodayPOs[duePromptIndex].supplier}</strong> was due today.
                            Has it arrived?
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button className="btn btn-outline" onClick={() => {
                                if (duePromptIndex + 1 < dueTodayPOs.length) {
                                    setDuePromptIndex(duePromptIndex + 1);
                                } else {
                                    setShowDuePrompt(false);
                                }
                            }}>Not Yet</button>
                            <button className="btn btn-primary" onClick={() => {
                                setShowDuePrompt(false);
                                router.push(`/purchasing/${dueTodayPOs[duePromptIndex].id}`);
                            }}>Yes — View Details</button>
                        </div>
                        {dueTodayPOs.length > 1 && (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
                                {duePromptIndex + 1} of {dueTodayPOs.length} due POs
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Active Purchase Orders */}
            <div className="card" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>Active Purchase Orders</h3>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            className="input-group"
                            placeholder="Search by PO#, Supplier or SO#..."
                            value={poSearch}
                            onChange={e => setPoSearch(e.target.value)}
                            style={{ width: '260px', margin: 0, padding: '0.4rem 0.75rem', fontSize: '0.875rem' }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <input 
                                type="checkbox" 
                                checked={includeCompleted} 
                                onChange={e => setIncludeCompleted(e.target.checked)} 
                            />
                            Search Arrived/All
                        </label>
                        {selectedPoIds.size > 0 && isAdmin && (
                            <button className="btn btn-outline" style={{ borderColor: '#ef4444', color: '#ef4444', padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} onClick={handleDeleteSelectedPOs}>
                                <Trash2 size={16} style={{ marginRight: '0.5rem' }} /> Delete Selected ({selectedPoIds.size})
                            </button>
                        )}
                    </div>
                </div>
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
                                    <th style={{ padding: '1rem', width: '40px' }}>
                                        {isAdmin && (
                                            <div
                                                className="checkbox"
                                                onClick={() => {
                                                    const validPos = pos.filter(p => p.status !== 'Completed' && p.status !== 'Partial');
                                                    if (selectedPoIds.size === validPos.length && validPos.length > 0) setSelectedPoIds(new Set());
                                                    else setSelectedPoIds(new Set(validPos.map(p => p.id)));
                                                }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {(selectedPoIds.size === pos.filter(p => p.status !== 'Completed' && p.status !== 'Partial').length && pos.filter(p => p.status !== 'Completed' && p.status !== 'Partial').length > 0) ? <CheckSquare size={18} /> : <Square size={18} />}
                                            </div>
                                        )}
                                    </th>
                                    <th style={{ padding: '1rem' }}>PO Number</th>
                                    <th style={{ padding: '1rem' }}>Supplier</th>
                                    <th style={{ padding: '1rem' }}>Linked SO</th>
                                    <th style={{ padding: '1rem' }}>Items</th>
                                    <th style={{ padding: '1rem' }}>Order Date</th>
                                    <th style={{ padding: '1rem' }}>Arrival Status</th>
                                    <th style={{ padding: '1rem' }}>Due Date</th>
                                    <th style={{ padding: '1rem' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pos
                                    .filter((po: any) => {
                                        const q = poSearch.toLowerCase();
                                        if (!q) return true;
                                        return (
                                            po.poNumber.toLowerCase().includes(q) ||
                                            po.supplier.toLowerCase().includes(q) ||
                                            (po.salesOrder?.soNumber || '').toLowerCase().includes(q)
                                        );
                                    })
                                    .map(po => (
                                    <tr key={po.id} style={{ 
                                        borderBottom: '1px solid var(--border-color)', 
                                        background: selectedPoIds.has(po.id) ? 'rgba(7, 89, 133, 0.1)' : po.status === 'Synced' ? 'rgba(124, 58, 237, 0.08)' : 'transparent' 
                                    }}>
                                        <td style={{ padding: '1rem' }}>
                                            {((po.status !== 'Completed' && po.status !== 'Partial') && isAdmin) ? (
                                                <div
                                                    className="checkbox"
                                                    onClick={() => toggleSelectPo(po.id)}
                                                    style={{ cursor: 'pointer', color: selectedPoIds.has(po.id) ? 'var(--primary)' : 'var(--text-muted)' }}
                                                >
                                                    {selectedPoIds.has(po.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                                                </div>
                                            ) : (
                                                <span style={{ display: 'inline-block', width: '18px' }} />
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem', fontWeight: 600 }}>{po.poNumber}</td>
                                        <td style={{ padding: '1rem' }}>{po.supplier}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {po.salesOrder ? (
                                                <Link href={`/sales?id=${po.salesOrderId}`} style={{ fontSize: '0.85rem', color: 'var(--primary)', textDecoration: 'underline' }}>
                                                    {po.salesOrder.soNumber}
                                                </Link>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem' }}>{po.lines?.length || 0}</td>
                                        <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                            {new Date(po.orderDate || po.createdAt).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <span style={{ 
                                                display: 'inline-flex', 
                                                padding: '0.25rem 0.75rem', 
                                                borderRadius: '999px', 
                                                fontSize: '0.75rem', 
                                                background: po.status === 'Completed' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                color: po.status === 'Completed' ? '#16a34a' : '#d97706'
                                            }}>
                                                {po.status === 'Completed' ? 'Arrived' : 'In Transit'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <EditableDueCell po={po} onUpdate={handleUpdateDueDate} />
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
                                                    onChange={(e) => updateQuantity(item.id, parseFloat(e.target.value) || 0)}
                                                    step="any"
                                                    min="0.00000001"
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
