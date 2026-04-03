'use client'

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPurchaseOrder, addPOLine, removePOLine, updatePOStatus, getItems, updatePOLine, updatePODueDate, updatePONumber, getPOHistory, getWarehouses, receivePOItems, updatePOLinkedSO } from '../actions';
import { getSalesOrders } from '@/app/sales/actions';
import { Plus, Trash2, Save, ArrowLeft, Package, Zap, History } from 'lucide-react';
import Link from 'next/link';
import { useSystem } from '@/components/SystemProvider';

function EditablePOLine({ line, po, handleRemoveLine, handleUpdateLine }: any) {
    const isDraft = po.status !== 'Completed' && po.status !== 'Partial';
    const pending = line.quantity - line.received;
    const isComplete = pending <= 0;
    
    const [quantity, setQuantity] = useState(line.quantity);
    const [unitCost, setUnitCost] = useState(line.unitCost);

    useEffect(() => {
        setQuantity(line.quantity);
        setUnitCost(line.unitCost);
    }, [line.quantity, line.unitCost]);

    const handleBlur = () => {
        const q = isNaN(quantity) || quantity <= 0 ? 1 : quantity;
        const c = isNaN(unitCost) || unitCost < 0 ? 0 : unitCost;
        if (q !== line.quantity || c !== line.unitCost) {
            handleUpdateLine(line.id, q, c);
        } else {
            setQuantity(line.quantity);
            setUnitCost(line.unitCost);
        }
    };

    return (
        <tr style={{ borderBottom: '1px solid var(--border-color)', opacity: isComplete ? 0.6 : 1 }}>
            <td style={{ padding: '1rem', fontWeight: 500 }}>
                {line.item?.sku || line.newItemSku || <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>New Item</span>}
            </td>
            <td style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {line.item?.name || line.newItemName || 'Unknown Item'}
                    {line.isAutoMapped && (
                        <span
                            title="Automatically mapped from iCount via ExternalMapping"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                background: 'rgba(99,102,241,0.15)',
                                color: '#818cf8',
                                borderRadius: '4px',
                                padding: '0.1rem 0.4rem',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                cursor: 'help'
                            }}
                        >
                            <Zap size={10} /> Auto-Mapped
                        </span>
                    )}
                    {!line.item && !line.isAutoMapped && (
                        <span className="badge badge-secondary" style={{ marginLeft: '0.5rem', fontSize: '0.7em' }}>Pending Creation</span>
                    )}
                </div>
            </td>
            <td style={{ padding: '1rem' }}>
                {isDraft ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        $ <input 
                            type="number" 
                            value={unitCost} 
                            onChange={e => setUnitCost(e.target.value === '' ? 0 : parseFloat(e.target.value))} 
                            onBlur={handleBlur}
                            className="input-group"
                            style={{ width: '80px', margin: 0, padding: '0.25rem 0.5rem' }}
                            step="0.01"
                            min="0"
                        />
                    </div>
                ) : (
                    `$${line.unitCost.toFixed(2)}`
                )}
            </td>
            <td style={{ padding: '1rem' }}>
                {isDraft ? (
                    <input 
                        type="number" 
                        value={quantity} 
                        onChange={e => setQuantity(e.target.value === '' ? 1 : parseInt(e.target.value))} 
                        onBlur={handleBlur}
                        className="input-group"
                        style={{ width: '80px', margin: 0, padding: '0.25rem 0.5rem' }}
                        min="1"
                    />
                ) : (
                    line.quantity
                )}
            </td>
            <td style={{ padding: '1rem', color: 'var(--success)' }}>{line.received}</td>
            <td style={{ padding: '1rem', color: pending > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {pending > 0 ? pending : '✓'}
            </td>
            <td style={{ padding: '1rem', fontWeight: 600 }}>${(line.quantity * line.unitCost).toFixed(2)}</td>
            <td style={{ padding: '1rem' }}>
                {po.status !== 'Completed' && line.received === 0 && (
                    <button
                        onClick={() => handleRemoveLine(line.id, line.item?.name || line.newItemName || 'Item')}
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
}

export default function PODetailPage() {
    const params = useParams();
    const router = useRouter();
    const { showAlert, showConfirm } = useSystem();
    const poId = parseInt(params.id as string);

    const [po, setPo] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [salesOrders, setSalesOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // History State
    const [showHistory, setShowHistory] = useState(false);
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Add Line State
    const [showAddLine, setShowAddLine] = useState(false);

    // Edit PO Number State
    const [isEditingPo, setIsEditingPo] = useState(false);
    const [editPoNumber, setEditPoNumber] = useState('');

    // Quick Receipt State
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
    const [isReceiving, setIsReceiving] = useState(false);

    // Add Line State
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState(1);

    // New Item State
    const [isNewItem, setIsNewItem] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemSku, setNewItemSku] = useState('');
    const [newItemCost, setNewItemCost] = useState(0);

    useEffect(() => {
        loadData();
    }, [poId]);

    async function loadData() {
        setLoading(true);
        const [poRes, itemsRes, whRes, soRes] = await Promise.all([
            getPurchaseOrder(poId),
            getItems(),
            getWarehouses(),
            getSalesOrders()
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
        if (whRes.success && whRes.data) {
            setWarehouses(whRes.data);
            if (whRes.data.length > 0) setSelectedWarehouseId(whRes.data[0].id.toString());
        }
        setLoading(false);
    }

    async function handleAddLine() {
        if (!isNewItem && !selectedItemId) {
            showAlert('Select an item.', 'warning');
            return;
        }
        if (isNewItem && !newItemName) {
            showAlert('Enter item name.', 'warning');
            return;
        }
        if (quantity <= 0) {
            showAlert('Enter quantity > 0.', 'warning');
            return;
        }

        let cost = 0;
        let itemId: number | undefined;

        if (!isNewItem) {
            const item = items.find(i => i.id === parseInt(selectedItemId));
            if (!item) return;
            cost = item.cost;
            itemId = item.id;
        } else {
            cost = newItemCost;
        }

        const res = await addPOLine(
            poId,
            quantity,
            cost,
            itemId,
            isNewItem ? newItemName : undefined,
            isNewItem ? newItemSku : undefined
        );

        if (res.success) {
            showAlert('Item added to PO', 'success');
            // Reset form
            setSelectedItemId('');
            setNewItemName('');
            setNewItemSku('');
            setNewItemCost(0);
            setQuantity(1);
            setIsNewItem(false);
            setShowAddLine(false);
            loadData(); // Reload PO lines
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

    async function handleUpdateLine(lineId: number, newQty: number, newCost: number) {
        const res = await updatePOLine(lineId, newQty, newCost);
        if (res.success) {
            loadData();
        } else {
            showAlert(res.error || 'Failed to update line', 'error');
            loadData();
        }
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

    async function handleUpdateDueDate(dateStr: string) {
        const res = await updatePODueDate(poId, dateStr);
        if (res.success) {
            showAlert('Due date updated', 'success');
            loadData();
        } else {
            showAlert(res.error || 'Failed to update due date', 'error');
        }
    }

    async function handleSavePoNumber() {
        if (!editPoNumber.trim() || editPoNumber === po.poNumber) {
            setIsEditingPo(false);
            return;
        }
        const res = await updatePONumber(poId, editPoNumber.trim());
        if (res.success) {
            showAlert('PO Name updated', 'success');
            loadData();
        } else {
            showAlert(res.error || 'Failed to update PO Name', 'error');
            setEditPoNumber(po.poNumber);
        }
        setIsEditingPo(false);
    }

    async function handleQuickReceive() {
        if (!selectedWarehouseId) {
            showAlert('Please select a warehouse', 'warning');
            return;
        }

        const itemsToReceive = po.lines
            .filter((l: any) => l.quantity > l.received)
            .map((l: any) => ({
                lineId: l.id,
                qty: l.quantity - l.received
            }));

        if (itemsToReceive.length === 0) {
            showAlert('No pending items to receive', 'info');
            setShowReceiveModal(false);
            return;
        }

        setIsReceiving(true);
        const res = await receivePOItems(poId, itemsToReceive, parseInt(selectedWarehouseId));
        setIsReceiving(false);

        if (res.success) {
            showAlert('Purchase Order received successfully', 'success');
            setShowReceiveModal(false);
            loadData();
        } else {
            showAlert(res.error || 'Failed to receive items', 'error');
        }
    }

    async function handleViewHistory() {
        setShowHistory(true);
        setLoadingHistory(true);
        const res = await getPOHistory(poId);
        if (res.success && res.data) {
            setHistoryLogs(res.data);
        } else {
            showAlert(res.error || 'Failed to load history', 'error');
        }
        setLoadingHistory(false);
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

    const poDate = new Date(po.createdAt);
    let dueElement = null;

    if (po.leadTimeDays) {
        const dueDate = new Date(poDate);
        dueDate.setDate(dueDate.getDate() + po.leadTimeDays);
        const now = new Date();
        const diffTime = dueDate.getTime() - now.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isOverdue = daysLeft < 0;

        dueElement = (
            <span style={{
                color: isOverdue ? 'var(--error)' : daysLeft <= 2 ? 'var(--warning)' : 'var(--text-muted)',
                fontWeight: isOverdue ? 700 : 400
            }}>
                • Due: {dueDate.toISOString().split('T')[0]}
                ({isOverdue ? `Overdue by ${Math.abs(daysLeft)} days` : `${daysLeft} days left`})
            </span>
        );
    }

    let initialDate = '';
    if (po.leadTimeDays) {
        const d = new Date(po.createdAt);
        d.setDate(d.getDate() + po.leadTimeDays);
        initialDate = d.toISOString().split('T')[0];
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <Link href="/purchasing" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                            <ArrowLeft size={20} />
                        </Link>
                        {isEditingPo ? (
                            <input
                                autoFocus
                                className="input-group"
                                style={{ fontSize: '1.5rem', fontWeight: 700, padding: '0.25rem 0.5rem', width: '300px' }}
                                value={editPoNumber}
                                onChange={e => setEditPoNumber(e.target.value)}
                                onBlur={handleSavePoNumber}
                                onKeyDown={e => { if (e.key === 'Enter') handleSavePoNumber(); if (e.key === 'Escape') setIsEditingPo(false); }}
                            />
                        ) : (
                            <h1 onClick={() => { setEditPoNumber(po.poNumber); setIsEditingPo(true); }} style={{ margin: 0, cursor: 'text' }} title="Click to edit Name/Number">
                                {po.poNumber}
                            </h1>
                        )}
                        <span className={`badge badge-${po.status === 'Completed' ? 'success' : po.status === 'Partial' ? 'warning' : 'secondary'}`}>
                            {po.status}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Supplier: <strong>{po.supplier}</strong> •
                        Created: <span>{poDate.toISOString().split('T')[0]}</span>
                        {po.status !== 'Completed' && po.status !== 'Partial' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem' }}>
                                • Due: 
                                <input 
                                    type="date"
                                    className="input-group"
                                    style={{ padding: '0.25rem 0.5rem', margin: 0, width: '130px', fontSize: '0.875rem' }}
                                    defaultValue={initialDate}
                                    onBlur={(e) => {
                                        if (e.target.value !== initialDate && e.target.value !== '') {
                                            handleUpdateDueDate(e.target.value);
                                        }
                                    }}
                                />
                                • Linked SO:
                                <select 
                                    className="input-group"
                                    style={{ padding: '0.25rem 0.5rem', margin: 0, width: '130px', fontSize: '0.875rem' }}
                                    value={po.salesOrderId || ''}
                                    onChange={async (e) => {
                                        const soId = e.target.value ? parseInt(e.target.value) : null;
                                        const res = await updatePOLinkedSO(po.id, soId);
                                        if (res.success) {
                                            showAlert('Linked Sales Order updated', 'success');
                                            loadData();
                                        } else {
                                            showAlert(res.error || 'Failed to update link', 'error');
                                        }
                                    }}
                                >
                                    <option value="">None</option>
                                    {salesOrders.map(so => (
                                        <option key={so.id} value={so.id}>{so.soNumber}</option>
                                    ))}
                                </select>
                            </span>
                        ) : (
                            <>
                                {dueElement}
                                {po.salesOrder && (
                                    <span style={{ marginLeft: '0.5rem' }}>
                                        • Joined to SO: <strong>{po.salesOrder.soNumber}</strong>
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-outline" onClick={handleViewHistory} title="View Audit Logs">
                        <History size={18} />
                    </button>
                    {po.status === 'Draft' && (
                        <button className="btn btn-outline" onClick={() => handleStatusChange('Sent')}>
                            Mark as Sent
                        </button>
                    )}
                    {po.status !== 'Completed' && (
                        <button className="btn btn-primary" onClick={() => setShowReceiveModal(true)}>
                            <Package size={18} />
                            Confirm Receipt
                        </button>
                    )}
                    <Link href="/purchasing/receive" className="btn btn-outline">
                        <ArrowLeft size={18} style={{ transform: 'rotate(180deg)' }} /> Detailed Receive
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
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <input
                                    type="checkbox"
                                    checked={isNewItem}
                                    onChange={e => setIsNewItem(e.target.checked)}
                                />
                                Create new item (not in inventory list)
                            </label>
                        </div>

                        <div className={isNewItem ? "grid-cols-4" : "grid-cols-3"} style={{ alignItems: 'end', gap: '1rem' }}>

                            {!isNewItem ? (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Item</label>
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
                            ) : (
                                <>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>New Item Name</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            placeholder="Item Name"
                                            value={newItemName}
                                            onChange={e => setNewItemName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>SKU (Opt)</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            placeholder="SKU"
                                            value={newItemSku}
                                            onChange={e => setNewItemSku(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cost</label>
                                        <input
                                            type="number"
                                            className="input-group"
                                            placeholder="0.00"
                                            value={newItemCost}
                                            onChange={e => setNewItemCost(parseFloat(e.target.value))}
                                            step="0.01"
                                        />
                                    </div>
                                </>
                            )}

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Quantity</label>
                                <input
                                    type="number"
                                    className="input-group"
                                    value={quantity}
                                    onChange={e => setQuantity(parseInt(e.target.value))}
                                    min="1"
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn btn-primary" onClick={handleAddLine} style={{ height: '42px' }}>
                                    <Save size={16} style={{ marginRight: '0.5rem' }} /> Add
                                </button>
                                <button className="btn btn-outline" onClick={() => setShowAddLine(false)} style={{ height: '42px' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Lines Table */}
                {
                    po.lines && po.lines.length > 0 ? (
                        <div className="table-responsive">
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
                                    {po.lines.map((line: any) => (
                                        <EditablePOLine 
                                            key={line.id} 
                                            line={line} 
                                            po={po} 
                                            handleRemoveLine={handleRemoveLine} 
                                            handleUpdateLine={handleUpdateLine} 
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <p>No items in this PO yet. Click "Add Item" to get started.</p>
                        </div>
                    )
                }
            </div >

            {/* History Modal */}
            {showHistory && (
                <div className="modal-overlay" onClick={() => setShowHistory(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <History size={22} color="var(--primary)" />
                                PO History Log
                            </h2>
                            <button className="btn btn-outline" onClick={() => setShowHistory(false)}>Close</button>
                        </div>
                        {loadingHistory ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading history...</div>
                        ) : historyLogs.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No history logs found for this PO yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {historyLogs.map((log: any) => {
                                    let details: any = null;
                                    try { details = log.details ? JSON.parse(log.details) : null; } catch {}
                                    const actionLabel = log.action.replace(/_/g, ' ');
                                    return (
                                        <div key={log.id} style={{ background: 'var(--bg-dark)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                                <strong style={{ textTransform: 'capitalize' }}>{actionLabel.toLowerCase()}</strong>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {new Date(log.createdAt).toLocaleString()}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: details ? '0.5rem' : 0 }}>
                                                by {log.user.name || log.user.email}
                                            </div>
                                            {details && (
                                                <pre style={{ background: 'rgba(0,0,0,0.25)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.78rem', margin: 0, whiteSpace: 'pre-wrap' }}>
                                                    {JSON.stringify(details, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Quick Receipt Modal */}
            {showReceiveModal && (
                <div className="modal-overlay" onClick={() => !isReceiving && setShowReceiveModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Package size={24} color="var(--primary)" />
                            Confirm Delivery
                        </h2>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                            Choose the destination warehouse to receive all {totalOrdered - totalReceived} pending items.
                        </p>
                        
                        <div className="form-group">
                            <label>Destination Warehouse</label>
                            <select 
                                className="input-group"
                                value={selectedWarehouseId}
                                onChange={e => setSelectedWarehouseId(e.target.value)}
                                disabled={isReceiving}
                            >
                                {warehouses.map(wh => (
                                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                            <button 
                                className="btn btn-outline" 
                                onClick={() => setShowReceiveModal(false)}
                                disabled={isReceiving}
                            >
                                Cancel
                            </button>
                            <button 
                                className="btn btn-primary" 
                                onClick={handleQuickReceive}
                                disabled={isReceiving || !selectedWarehouseId}
                            >
                                {isReceiving ? 'Processing...' : 'Confirm Receipt'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
