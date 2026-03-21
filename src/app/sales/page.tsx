'use client'
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

import { Plus, Search, X, Package, Trash2, CheckCircle, AlertCircle, Hammer } from 'lucide-react';
import { getSalesOrders, createSalesOrder, updateSalesOrderStatus, addSalesLine, removeSalesLine, getSellableItems, deleteSalesOrder, bulkDeleteSalesOrders, getRecentProductionRuns, explodeOrderBOM, linkSalesOrderDetails, previewMissingRequirements, autoProcureMissingRequirements } from './actions';
import { createEmptyPO, getBrands } from '../purchasing/actions';
import { runProduction } from '../production/actions';

// Simple Types for the UI
type SalesOrder = {
    id: number;
    soNumber: string;
    customer: string;
    status: string;
    createdAt: Date;
    lines: any[];
    item?: any | null;
    quantity?: number | null;
    productionRuns?: any[];
    shipments?: any[];
    purchaseOrders?: any[];
    productionRunId?: number | null;
    isAllocated?: boolean;
    productionRun?: {
        id: number;
        createdAt: Date;
        item?: { name: string; sku: string } | null;
        warehouse?: string | null;
    } | null;
};

type Item = {
    id: number;
    sku: string;
    name: string;
    type: string;
    currentStock: number;
    allocatedStock?: number;
    price: number;
    brand?: string | null;
    isSerialized?: boolean;
};

import { useSystem } from '@/components/SystemProvider';

export default function SalesPage() {
    const { user, showAlert, showConfirm } = useSystem();
    const isAdmin = user?.role === 'Admin';
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // New Order Form State
    const [newCustomer, setNewCustomer] = useState('');
    const [newSoNumber, setNewSoNumber] = useState('');

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadOrders();
    }, []);

    function toggleSelect(id: number) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    }

    function toggleSelectAll() {
        if (selectedIds.size === orders.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(orders.map(o => o.id)));
        }
    }

    async function handleDelete(id: number) {
        showConfirm('Are you sure you want to delete this order?', async () => {
            const res = await deleteSalesOrder(id);
            if (res.success) {
                loadOrders();
                showAlert('Order deleted', 'success');
            } else {
                showAlert('Failed to delete order', 'error');
            }
        });
    }

    async function handleBulkDelete() {
        showConfirm(`Delete ${selectedIds.size} orders?`, async () => {
            const res = await bulkDeleteSalesOrders(Array.from(selectedIds));
            if (res.success) {
                setSelectedIds(new Set());
                loadOrders();
                showAlert('Orders deleted', 'success');
            } else {
                showAlert('Failed to delete orders', 'error');
            }
        });
    }
    const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // Item Picker State
    const [sellableItems, setSellableItems] = useState<Item[]>([]);
    const [itemSearch, setItemSearch] = useState('');
    const [showProductionOnly, setShowProductionOnly] = useState(false); // Filter for "Production" items


    useEffect(() => {
        loadOrders();
    }, []);

    async function loadOrders() {
        setLoading(true);
        const [ordRes, itemRes] = await Promise.all([
            getSalesOrders(),
            getSellableItems()
        ]);

        if (ordRes.success) setOrders(ordRes.data || []);
        if (itemRes.success) setSellableItems(itemRes.data || []);

        setLoading(false);
    }

    // Refresh single order details if open
    async function refreshOrder(id: number) {
        const [ordRes, itemRes] = await Promise.all([
            getSalesOrders(),
            getSellableItems()
        ]);

        if (ordRes.success && ordRes.data) {
            const updated = ordRes.data.find(o => o.id === id);
            if (updated) setSelectedOrder(updated);
            setOrders(ordRes.data);
        }
        if (itemRes.success) setSellableItems(itemRes.data || []);
    }

    async function openNewOrderModal() {
        setNewCustomer('');
        setNewSoNumber('');
        setShowModal(true);
    }

    async function handlecreateOrder(e: React.FormEvent) {
        e.preventDefault();
        if (!newCustomer || !newSoNumber) return;

        const res = await createSalesOrder({
            customer: newCustomer,
            soNumber: newSoNumber
        });
        if (res.success) {
            setShowModal(false);
            setNewCustomer('');
            setNewSoNumber('');
            loadOrders(); // Reload to see new data
            showAlert('Order created', 'success');
        } else {
            showAlert('Failed to create order', 'error');
        }
    }

    async function handleConfirmOrder(id: number) {
        showConfirm('Are you sure you want to confirm this order? This will sync to iCount.', async () => {
            const res = await updateSalesOrderStatus(id, 'Confirmed');
            if (res.success) {
                if (res.warning) showAlert(res.warning, 'warning');
                else showAlert('Order confirmed', 'success');
                loadOrders();
            } else {
                showAlert('Failed to confirm order', 'error');
            }
        });
    }

    const [visibleCount, setVisibleCount] = useState(20);
    const filteredOrders = orders.filter(order =>
        searchTerm === '' ||
        order.soNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.status.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const displayedOrders = filteredOrders.slice(0, visibleCount);

    return (
        <>
            <div className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1>Sales Orders</h1>
                        <p>Manage customer orders and shipments.</p>
                    </div>
                    <button className="btn btn-primary" onClick={openNewOrderModal}>
                        <Plus size={18} />
                        New Order
                    </button>
                </div>

                <div className="card">
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', justifyContent: 'space-between' }}>
                        <div style={{
                            position: 'relative',
                            maxWidth: '300px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            background: 'var(--bg-dark)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.6rem 1rem',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            <Search size={18} style={{ color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search orders..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-main)',
                                    outline: 'none',
                                    width: '100%',
                                    fontSize: '0.95rem'
                                }}
                            />
                        </div>
                        {selectedIds.size > 0 && isAdmin && (
                            <button
                                className="btn btn-outline"
                                onClick={handleBulkDelete}
                                style={{ color: '#ef4444', borderColor: '#ef4444' }}
                            >
                                <Trash2 size={16} style={{ marginRight: '0.5rem' }} /> Delete ({selectedIds.size})
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading orders...</div>
                    ) : (
                        <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                        <th style={{ padding: '1rem', width: '40px' }}>
                                            <input
                                                type="checkbox"
                                                onChange={toggleSelectAll}
                                                checked={orders.length > 0 && selectedIds.size === orders.length}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                        </th>
                                        <th style={{ padding: '1rem' }}>SO Number</th>
                                        <th style={{ padding: '1rem' }}>Customer</th>
                                        <th style={{ padding: '1rem' }}>Status</th>
                                        <th style={{ padding: '1rem' }}>Date</th>
                                        <th style={{ padding: '1rem' }}>Total</th>
                                        <th style={{ padding: '1rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No sales orders found. Create one to get started.
                                            </td>
                                        </tr>
                                    ) : (
                                        displayedOrders
                                            .map(order => (
                                                <tr key={order.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '1rem' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(order.id)}
                                                            onChange={() => toggleSelect(order.id)}
                                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '1rem' }}>{order.soNumber}</td>
                                                    <td style={{ padding: '1rem' }}>{order.customer}</td>
                                                    <td style={{ padding: '1rem' }}>
                                                        <span style={{
                                                            padding: '0.25rem 0.75rem',
                                                            borderRadius: '1rem',
                                                            fontSize: '0.875rem',
                                                            background: order.status === 'Confirmed' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                                                            color: order.status === 'Confirmed' ? '#3b82f6' : 'var(--text-muted)'
                                                        }}>{order.status}</span>
                                                    </td>
                                                    <td style={{ padding: '1rem' }}>{new Date(order.createdAt).toLocaleDateString()}</td>
                                                    <td style={{ padding: '1rem' }}>
                                                        ${order.lines.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            className="btn btn-outline"
                                                            style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                                                            onClick={() => {
                                                                setSelectedOrder(order);
                                                                setItemSearch('');
                                                                setIsDetailsOpen(true);
                                                            }}
                                                        >
                                                            Details / Edit
                                                        </button>
                                                        {order.status === 'Draft' && (
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#10b981', borderColor: '#10b981' }}
                                                                onClick={() => handleConfirmOrder(order.id)}
                                                            >
                                                                Confirm
                                                            </button>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                className="btn btn-outline"
                                                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', color: '#ef4444', borderColor: '#ef4444' }}
                                                                onClick={() => handleDelete(order.id)}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                    )}
                                </tbody>
                            </table>
                            {filteredOrders.length > visibleCount && (
                                <div style={{ textAlign: 'center', marginTop: '1rem', padding: '1rem' }}>
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 20)}
                                        className="btn btn-outline"
                                        style={{ width: '100%', maxWidth: '300px' }}
                                    >
                                        Load More ({filteredOrders.length - visibleCount} remaining)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Simple Modal */}
            {
                showModal && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
                    }}>
                        <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h3>New Sales Order</h3>
                                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handlecreateOrder}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>SO Number</label>
                                    <input
                                        type="text"
                                        value={newSoNumber}
                                        onChange={e => setNewSoNumber(e.target.value)}
                                        placeholder="e.g. SO-2024-001"
                                        className="input-group"
                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        required
                                    />
                                </div>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Customer Name</label>
                                    <input
                                        type="text"
                                        value={newCustomer}
                                        onChange={e => setNewCustomer(e.target.value)}
                                        placeholder="e.g. Acme Corp"
                                        className="input-group"
                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        required
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Create Order</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            {/* Order Details Modal / Drawer */}
            {
                isDetailsOpen && selectedOrder && (
                    <OrderDetails
                        order={selectedOrder}
                        items={sellableItems}
                        onClose={() => setIsDetailsOpen(false)}
                        onUpdate={() => refreshOrder(selectedOrder.id)}
                        itemSearch={itemSearch}
                        setItemSearch={setItemSearch}
                        showProductionOnly={showProductionOnly}
                        setShowProductionOnly={setShowProductionOnly}
                    />
                )
            }
        </>
    )
}

function OrderDetails({ order, items, onClose, onUpdate, itemSearch, setItemSearch, showProductionOnly, setShowProductionOnly }: any) {
    const { showAlert, showConfirm } = useSystem();
    const [selectedItemId, setSelectedItemId] = useState('');
    const [qty, setQty] = useState(1);
    const [adding, setAdding] = useState(false);

    // Filter items
    const filteredItems = items.filter((i: Item) => {
        const matchSearch = i.name.toLowerCase().includes(itemSearch.toLowerCase()) || i.sku.toLowerCase().includes(itemSearch.toLowerCase());
        const matchType = showProductionOnly ? (i.type === 'Product' || i.type === 'Assembly') : true;
        return matchSearch && matchType;
    });

    async function handleAddLine() {
        if (!selectedItemId) {
            showAlert('Select a product first', 'warning');
            return;
        }
        if (qty <= 0) {
            showAlert('Quantity must be positive', 'warning');
            return;
        }

        const item = items.find((i: Item) => i.id === parseInt(selectedItemId));
        if (!item) return;

        setAdding(true);
        const res = await addSalesLine(order.id, item.id, qty, item.price);
        setAdding(false);

        if (res.success) {
            setSelectedItemId('');
            setQty(1);
            onUpdate();
        } else {
            showAlert('Failed to add item', 'error');
        }
    }

    async function handleRemoveLine(lineId: number) {
        showConfirm('Remove this line?', async () => {
            const res = await removeSalesLine(lineId);
            if (res.success) onUpdate();
        });
    }

    async function handleProduce(item: Item, qty: number) {
        showConfirm(`Run production for ${qty} x ${item.name}? This will deduct components and add to stock.`, async () => {
            let serials: string[] = [];
            if (item.isSerialized) {
                const input = prompt(`Enter ${qty} Serial Numbers (comma separated):`);
                if (!input) return;
                serials = input.split(',').map(s => s.trim()).filter(Boolean);
                if (serials.length !== qty) {
                    showAlert(`Expected ${qty} serial numbers, got ${serials.length}`, 'warning');
                    return;
                }
            }

            const res = await runProduction(item.id, qty, serials);
            if (res.success) {
                showAlert('Production complete! Stock updated.', 'success');
                onUpdate();
            } else {
                showAlert('Production failed: ' + res.error, 'error');
            }
        });
    }

    const [exploding, setExploding] = useState(false);

    // Procurement Wizard state
    const [showWizard, setShowWizard] = useState(false);
    const [wizardLoading, setWizardLoading] = useState(false);
    const [wizardShortages, setWizardShortages] = useState<any[] | null>(null);
    const [wizardProcuring, setWizardProcuring] = useState(false);

    async function handleOpenWizard() {
        setShowWizard(true);
        setWizardShortages(null);
        setWizardLoading(true);
        const res = await previewMissingRequirements(order.id);
        setWizardLoading(false);
        if (!res.success) {
            showAlert(res.error || 'Failed to analyse requirements', 'error');
            setShowWizard(false);
        } else {
            setWizardShortages(res.data || []);
        }
    }

    async function handleAutoProcure() {
        setWizardProcuring(true);
        const res = await autoProcureMissingRequirements(order.id);
        setWizardProcuring(false);
        if (res.success) {
            showAlert(res.message || 'POs created!', 'success');
            setShowWizard(false);
            onUpdate();
        } else {
            showAlert(res.error || 'Failed to create POs', 'error');
        }
    }

    // Link State
    const [editLink, setEditLink] = useState(false);
    const [linkItemId, setLinkItemId] = useState(order.item?.id ? String(order.item.id) : '');
    const [linkQty, setLinkQty] = useState<number | ''>(order.quantity || '');
    const [linkRunId, setLinkRunId] = useState(order.productionRunId ? String(order.productionRunId) : '');
    const [recentRuns, setRecentRuns] = useState<any[]>([]);

    const [showCreatePO, setShowCreatePO] = useState(false);
    const [brands, setBrands] = useState<string[]>([]);
    const [newSupplier, setNewSupplier] = useState('');
    const [leadTime, setLeadTime] = useState('');
    const [shippingCost, setShippingCost] = useState('');

    useEffect(() => {
        if (showCreatePO && brands.length === 0) {
            getBrands().then(res => {
                if (res.success) setBrands(res.data || []);
            });
        }
    }, [showCreatePO]);

    async function handleCreateEmptyPO() {
        if (!newSupplier) {
            showAlert('Select a supplier first', 'warning');
            return;
        }

        const days = leadTime ? parseInt(leadTime) : undefined;
        const shipping = shippingCost ? parseFloat(shippingCost) : undefined;

        const res = await createEmptyPO(newSupplier, days, shipping, order.id);
        if (res.success && res.data) {
            showAlert('PO created and linked to this order', 'success');
            setShowCreatePO(false);
            setNewSupplier('');
            setLeadTime('');
            setShippingCost('');
            onUpdate();
        } else {
            showAlert(res.error || 'Failed to create PO', 'error');
        }
    }

    useEffect(() => {
        if (editLink && recentRuns.length === 0) {
            getRecentProductionRuns().then(res => {
                if (res.success) setRecentRuns(res.data || []);
            });
        }
    }, [editLink]);

    async function handleSaveLink() {
        const res = await linkSalesOrderDetails({
            id: order.id,
            itemId: linkItemId ? parseInt(linkItemId) : null,
            quantity: linkQty ? Number(linkQty) : null,
            productionRunId: linkRunId ? parseInt(linkRunId) : null
        });
        if (res.success) {
            setEditLink(false);
            onUpdate();
        } else {
            showAlert('Failed to apply links', 'error');
        }
    }

    async function handleExportBOM() {
        if (!order.lines || order.lines.length === 0) {
            showAlert('Order must have items added to export BOM.', 'warning');
            return;
        }
        setExploding(true);
        const res = await explodeOrderBOM(order.id);
        setExploding(false);
        if (!res.success || !res.data) {
            showAlert(res.error || 'Failed to explode BOM', 'error');
            return;
        }
        const data = res.data.map((row: any) => ({
            SKU: row.item.sku,
            Name: row.item.name,
            'Base Qty': row.baseQuantity,
            'Required Qty (+10%)': row.requiredQuantity,
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'BOM Requirements');
        XLSX.writeFile(wb, `SO_${order.soNumber}_BOM.xlsx`);
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60
        }}>
            <div className="card" style={{ width: '1000px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-dark)' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Order {order.soNumber}</h2>
                        <div style={{ color: 'var(--text-muted)' }}>Customer: {order.customer}</div>
                    </div>
                    {editLink ? (
                        <div style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Linked Production Run</label>
                                <select value={linkRunId} onChange={e => setLinkRunId(e.target.value)} style={{ padding: '0.25rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px', display: 'block' }}>
                                    <option value="">-- None --</option>
                                    {recentRuns.map(run => <option key={run.id} value={run.id}>#{run.id} - {run.item?.name}</option>)}
                                </select>
                            </div>
                            <button className="btn btn-primary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', height: '100%' }} onClick={handleSaveLink}>Save</button>
                            <button className="btn btn-outline" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', height: '100%' }} onClick={() => setEditLink(false)}>Cancel</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {order.productionRunId ? (
                                <div style={{ background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Linked Production Run</div>
                                    <div style={{ fontWeight: 600 }}>#{order.productionRunId}</div>
                                </div>
                            ) : (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No Run Linked</div>
                            )}
                            <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => { setLinkRunId(order.productionRunId ? String(order.productionRunId) : ''); setEditLink(true); }}>
                                {order.productionRunId ? 'Edit Link' : 'Link Production Run'}
                            </button>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {order.lines && order.lines.length > 0 && (
                            <>
                                <button className="btn btn-outline" style={{ color: '#10b981', borderColor: '#10b981' }} onClick={handleExportBOM} disabled={exploding}>
                                    {exploding ? 'Exporting...' : 'Export BOM'}
                                </button>
                                <button className="btn btn-outline" style={{ color: '#f59e0b', borderColor: '#f59e0b' }} onClick={handleOpenWizard}>
                                    🔮 Procurement Wizard
                                </button>
                            </>
                        )}
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Dashboard Section */}
                <div style={{ padding: '1rem 1.5rem', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Production Status</div>
                        {order.productionRuns && order.productionRuns.length > 0 ? (
                            order.productionRuns.map((pr: any) => (
                                <div key={pr.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span>Run #{pr.id}</span>
                                    <span style={{ color: pr.status === 'Completed' ? '#10b981' : '#f59e0b' }}>{pr.status}</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No production runs linked.</div>
                        )}
                    </div>
                    <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Procurement Status</span>
                            <button className="btn btn-outline" style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', height: 'auto' }} onClick={() => setShowCreatePO(true)}>+ New PO</button>
                        </div>
                        {order.purchaseOrders && order.purchaseOrders.length > 0 ? (
                            order.purchaseOrders.map((po: any) => (
                                <div key={po.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span>{po.poNumber}</span>
                                    <span>{po.status}</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No POs linked.</div>
                        )}
                    </div>
                    <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Shipping Status</div>
                        {order.shipments && order.shipments.length > 0 ? (
                            order.shipments.map((sh: any) => (
                                <div key={sh.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                    <span>{sh.shipmentNo}</span>
                                    <span>{sh.status}</span>
                                </div>
                            ))
                        ) : (
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No shipments linked.</div>
                        )}
                    </div>
                </div>

                <div className="responsive-grid-sidebar">
                    {/* Left: Order Lines */}
                    <div style={{ padding: '1.5rem', overflowY: 'auto', borderRight: '1px solid var(--border-color)', minHeight: 0 }}>
                        <h4 style={{ marginBottom: '1rem' }}>Order Items</h4>
                        <div className="table-responsive">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '0.5rem' }}>Item</th>
                                        <th style={{ padding: '0.5rem' }}>Qty</th>
                                        <th style={{ padding: '0.5rem' }}>Unit Price</th>
                                        <th style={{ padding: '0.5rem' }}>Total</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.lines.length === 0 ? (
                                        <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No items added yet.</td></tr>
                                    ) : (
                                        order.lines.map((line: any) => {
                                            // We need to resolve Item name from ID since line only has IDs usually (or we included item in fetch? getSalesOrders includes lines but maybe NOT deeply nested item?)
                                            // Wait, getSalesOrders included lines: true, but line doesn't include item relation in findMany by default unless specific.
                                            // Ideally we should include item in getSalesOrders. But for now we can lookup in 'items' list passed in.
                                            const product = items.find((i: Item) => i.id === line.itemId);
                                            return (
                                                <tr key={line.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.5rem' }}>
                                                        <div style={{ fontWeight: 500 }}>{product?.name || 'Unknown Item'}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{product?.sku}</div>
                                                    </td>
                                                    <td style={{ padding: '0.5rem' }}>{line.quantity}</td>
                                                    <td style={{ padding: '0.5rem' }}>${line.unitPrice.toFixed(2)}</td>
                                                    <td style={{ padding: '0.5rem' }}>${(line.quantity * line.unitPrice).toFixed(2)}</td>
                                                    <td style={{ padding: '0.5rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                                        {(product?.type === 'Product' || product?.type === 'Assembly') && (
                                                            <button
                                                                onClick={() => product && handleProduce(product, line.quantity)}
                                                                className="btn btn-sm btn-outline"
                                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#f59e0b', borderColor: '#f59e0b' }}
                                                                title="Produce this item instantly"
                                                            >
                                                                <Hammer size={12} /> Produce
                                                            </button>
                                                        )}
                                                        {order.status === 'Draft' && (
                                                            <button onClick={() => handleRemoveLine(line.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right: Add Item (Product Picker) */}
                    <div style={{ padding: '1.5rem', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                        <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Plus size={16} /> Add Item
                        </h4>

                        {order.status !== 'Draft' ? (
                            <div style={{ padding: '1rem', background: 'rgba(255,255,0,0.1)', color: 'yellow', borderRadius: '4px', fontSize: '0.9rem' }}>
                                Order is {order.status}. Cannot add items.
                            </div>
                        ) : (
                            <>
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{
                                        marginBottom: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        background: 'var(--bg-dark)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '0.5rem 0.75rem'
                                    }}>
                                        <Search size={16} style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search items..."
                                            value={itemSearch}
                                            onChange={e => setItemSearch(e.target.value)}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', width: '100%', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={showProductionOnly}
                                            onChange={e => setShowProductionOnly(e.target.checked)}
                                        />
                                        Show Produced Items Only
                                    </label>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-dark)' }}>
                                    {filteredItems.map((item: Item) => (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedItemId(String(item.id))}
                                            style={{
                                                padding: '0.75rem',
                                                borderBottom: '1px solid var(--border-color)',
                                                cursor: 'pointer',
                                                background: selectedItemId === String(item.id) ? 'var(--primary)' : 'transparent',
                                                color: selectedItemId === String(item.id) ? 'white' : 'inherit'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ fontWeight: 500 }}>{item.sku}</span>
                                                <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>${item.price}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>{item.name}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.7 }}>
                                                <span>{item.type}</span>
                                                <span>Avail: {Math.max(0, (item.currentStock ?? 0) - (item.allocatedStock ?? 0))}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredItems.length === 0 && (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            No items found matching filters.
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <input
                                        type="number"
                                        min="1"
                                        value={qty}
                                        onChange={e => setQty(parseInt(e.target.value))}
                                        className="input-group"
                                        style={{ width: '80px', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'white' }}
                                    />
                                    <button
                                        className="btn btn-primary"
                                        style={{ flex: 1 }}
                                        onClick={handleAddLine}
                                        disabled={!selectedItemId || adding}
                                    >
                                        {adding ? 'Adding...' : 'Add to Order'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Create PO Modal (Overlay inside OrderDetails view) */}
            {showCreatePO && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}>
                    <div className="card" style={{ width: '400px', maxWidth: '90%' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>Create PO for Order {order.soNumber}</h3>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Lead Time (Days)</label>
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
                                    placeholder="0.00"
                                    value={shippingCost}
                                    onChange={e => setShippingCost(e.target.value)}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                            <button className="btn btn-outline" onClick={() => setShowCreatePO(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreateEmptyPO}>Create PO</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Procurement Wizard Modal */}
            {showWizard && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                    <div className="card" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ marginBottom: '0.25rem' }}>🔮 Procurement Wizard</h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>BOM requirements vs. available stock for {order.soNumber}</div>
                            </div>
                            <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {wizardLoading ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Analysing BOM requirements...</div>
                            ) : (wizardShortages ?? []).length === 0 && !wizardLoading ? (
                                <div style={{ textAlign: 'center', padding: '3rem' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                                    <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#10b981' }}>All components are in stock!</div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Available stock covers all BOM requirements (incl. 10% buffer).</div>
                                </div>
                            ) : (wizardShortages ?? []).length > 0 ? (
                                <>
                                    <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '0.9rem' }}>
                                        ⚠️ <strong>{(wizardShortages ?? []).length} component(s)</strong> are short. Auto-generate Purchase Order drafts below.
                                    </div>
                                    <div className="table-responsive">
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                                    <th style={{ padding: '0.75rem' }}>Component</th>
                                                    <th style={{ padding: '0.75rem' }}>Supplier</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Required</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Available</th>
                                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Shortfall</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(wizardShortages ?? []).map((s: any) => (
                                                    <tr key={s.item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '0.75rem' }}>
                                                            <div style={{ fontWeight: 500 }}>{s.item.name}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.item.sku}</div>
                                                        </td>
                                                        <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{s.item.brand || '—'}</td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>{s.requiredQty}</td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981' }}>{s.available}</td>
                                                        <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{s.shortfall}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : null}
                        </div>

                        {(wizardShortages ?? []).length > 0 && (
                            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: 'var(--bg-dark)' }}>
                                <button className="btn btn-outline" onClick={() => setShowWizard(false)}>Cancel</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleAutoProcure}
                                    disabled={wizardProcuring}
                                    style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                                >
                                    {wizardProcuring ? 'Generating POs...' : `⚡ Auto-Generate ${(wizardShortages ?? []).length} PO Line(s)`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
             {/* Procurement Wizard Modal */}
             {showWizard && (
                 <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
                     <div className="card" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                         <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div>
                                 <h3 style={{ marginBottom: '0.25rem' }}>🔮 Procurement Wizard</h3>
                                 <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>BOM requirements vs. available stock for {order.soNumber}</div>
                             </div>
                             <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
                         </div>
                         <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                             {wizardLoading ? (
                                 <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Analysing BOM requirements...</div>
                             ) : (wizardShortages ?? []).length === 0 && !wizardLoading ? (
                                 <div style={{ textAlign: 'center', padding: '3rem' }}>
                                     <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                                     <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#10b981' }}>All components are in stock!</div>
                                     <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Available stock covers all BOM requirements (incl. 10% buffer).</div>
                                 </div>
                             ) : (wizardShortages ?? []).length > 0 ? (
                                 <>
                                     <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '0.9rem' }}>
                                         ⚠️ <strong>{(wizardShortages ?? []).length} component(s)</strong> are short. Auto-generate Purchase Order drafts below.
                                     </div>
                                     <div className="table-responsive">
                                         <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                             <thead>
                                                 <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                                     <th style={{ padding: '0.75rem' }}>Component</th>
                                                     <th style={{ padding: '0.75rem' }}>Supplier</th>
                                                     <th style={{ padding: '0.75rem', textAlign: 'right' }}>Required</th>
                                                     <th style={{ padding: '0.75rem', textAlign: 'right' }}>Available</th>
                                                     <th style={{ padding: '0.75rem', textAlign: 'right' }}>Shortfall</th>
                                                 </tr>
                                             </thead>
                                             <tbody>
                                                 {(wizardShortages ?? []).map((s: any) => (
                                                     <tr key={s.item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                         <td style={{ padding: '0.75rem' }}>
                                                             <div style={{ fontWeight: 500 }}>{s.item.name}</div>
                                                             <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.item.sku}</div>
                                                         </td>
                                                         <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{s.item.brand || '—'}</td>
                                                         <td style={{ padding: '0.75rem', textAlign: 'right' }}>{s.requiredQty}</td>
                                                         <td style={{ padding: '0.75rem', textAlign: 'right', color: '#10b981' }}>{s.available}</td>
                                                         <td style={{ padding: '0.75rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{s.shortfall}</td>
                                                     </tr>
                                                 ))}
                                             </tbody>
                                         </table>
                                     </div>
                                 </>
                             ) : null}
                         </div>
                         {(wizardShortages ?? []).length > 0 && (
                             <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: 'var(--bg-dark)' }}>
                                 <button className="btn btn-outline" onClick={() => setShowWizard(false)}>Cancel</button>
                                 <button
                                     className="btn btn-primary"
                                     onClick={handleAutoProcure}
                                     disabled={wizardProcuring}
                                     style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                                 >
                                     {wizardProcuring ? 'Generating POs...' : `⚡ Auto-Generate ${(wizardShortages ?? []).length} PO Line(s)`}
                                 </button>
                             </div>
                         )}
                     </div>
                 </div>
             )}
         </div>
     );
 }
