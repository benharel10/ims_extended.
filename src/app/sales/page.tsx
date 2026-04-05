'use client'
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

import { Plus, Search, X, Package, Trash2, CheckCircle, AlertCircle, Hammer } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { getSalesOrders, createSalesOrder, updateSalesOrderStatus, addSalesLine, removeSalesLine, getSellableItems, deleteSalesOrder, bulkDeleteSalesOrders, getRecentProductionRuns, explodeOrderBOM, linkSalesOrderDetails, previewMissingRequirements, autoProcureMissingRequirements, getCustomers, addCustomer } from './actions';
import { createEmptyPO, getBrands, getWarehouses, getPurchaseOrders, updatePOLinkedSO } from '../purchasing/actions';
import { runProduction } from '../production/actions';

// Simple Types for the UI
type SalesOrder = {
    id: number;
    soNumber: string;
    customer: string;
    customerOrderNumber?: string | null;
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
    const searchParams = useSearchParams();
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // New Order Form State
    const [newCustomer, setNewCustomer] = useState('');
    const [newSoNumber, setNewSoNumber] = useState('');
    const [newCustomerOrderNum, setNewCustomerOrderNum] = useState('');

    // Customer list
    const [customers, setCustomers] = useState<string[]>([]);
    const [addingCustomer, setAddingCustomer] = useState(false);
    const [newCustomerInput, setNewCustomerInput] = useState('');

    // Filter
    const [customerFilter, setCustomerFilter] = useState('');

    // Selection State
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());


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

    // Handle deep linking from query params (e.g. /sales?id=123)
    useEffect(() => {
        const orderId = searchParams.get('id');
        if (orderId && orders.length > 0) {
            const idToFind = parseInt(orderId);
            const order = orders.find(o => o.id === idToFind);
            if (order) {
                // Pre-fill item picker search for clarity? (No, let's just open the details)
                setSelectedOrder(order);
                setIsDetailsOpen(true);
            }
        }
    }, [searchParams, orders]);

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
        
        // Auto-generate SO Number (e.g. SO-240330-1234)
        const d = new Date();
        const yymmdd = d.getFullYear().toString().slice(-2) + 
            String(d.getMonth() + 1).padStart(2, '0') + 
            String(d.getDate()).padStart(2, '0');
        const randomStr = Math.floor(1000 + Math.random() * 9000);
        setNewSoNumber(`SO-${yymmdd}-${randomStr}`);
        
        setNewCustomerOrderNum('');
        setAddingCustomer(false);
        setNewCustomerInput('');
        // Load customers
        const res = await getCustomers();
        if (res.success) setCustomers((res.data || []).map((c: any) => c.name));
        setShowModal(true);
    }

    async function handlecreateOrder(e: React.FormEvent) {
        e.preventDefault();
        if (!newCustomer || !newSoNumber) return;

        const res = await createSalesOrder({
            customer: newCustomer,
            soNumber: newSoNumber,
            customerOrderNumber: newCustomerOrderNum || undefined
        });
        if (res.success) {
            setShowModal(false);
            setNewCustomer('');
            setNewSoNumber('');
            setNewCustomerOrderNum('');
            loadOrders();
            showAlert('Order created', 'success');
        } else {
            showAlert(res.error || 'Failed to create order', 'error');
        }
    }

    async function handleAddNewCustomer() {
        if (!newCustomerInput.trim()) return;
        const res = await addCustomer(newCustomerInput.trim());
        if (res.success && res.data) {
            setCustomers(prev => [...prev, res.data!.name].sort());
            setNewCustomer(res.data.name);
            setNewCustomerInput('');
            setAddingCustomer(false);
        } else {
            showAlert(res.error || 'Failed to add customer', 'error');
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
    const filteredOrders = orders.filter(order => {
        const matchSearch = searchTerm === '' ||
            order.soNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (order.customerOrderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.status.toLowerCase().includes(searchTerm.toLowerCase());
        const matchCustomer = customerFilter === '' || order.customer === customerFilter;
        return matchSearch && matchCustomer;
    });
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
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{
                            position: 'relative',
                            flex: '1',
                            minWidth: '200px',
                            maxWidth: '320px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            background: 'var(--bg-dark)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            padding: '0.6rem 1rem',
                        }}>
                            <Search size={18} style={{ color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search SO#, customer order#..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', outline: 'none', width: '100%', fontSize: '0.95rem' }}
                            />
                        </div>
                        {/* Customer filter dropdown */}
                        <select
                            value={customerFilter}
                            onChange={e => { setCustomerFilter(e.target.value); setVisibleCount(20); }}
                            style={{ padding: '0.6rem 1rem', background: 'var(--bg-dark)', color: customerFilter ? 'var(--text-main)' : 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', cursor: 'pointer', minWidth: '150px' }}
                        >
                            <option value="">All Customers</option>
                            {Array.from(new Set(orders.map(o => o.customer))).sort().map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
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
                                        <th style={{ padding: '1rem' }}>Customer Order #</th>
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
                                                    <td style={{ padding: '1rem', fontWeight: 500 }}>{order.soNumber}</td>
                                                    <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                        {order.customerOrderNumber || <span style={{ opacity: 0.4 }}>—</span>}
                                                    </td>
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
                    <div className="card" style={{ width: '460px', maxWidth: '95%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                                <h3>New Sales Order</h3>
                                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handlecreateOrder}>
                                {/* Customer selector */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Customer</label>
                                    {!addingCustomer ? (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <select
                                                value={newCustomer}
                                                onChange={e => setNewCustomer(e.target.value)}
                                                required
                                                style={{ flex: 1, padding: '0.55rem 0.75rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: newCustomer ? 'white' : 'var(--text-muted)', fontSize: '0.9rem' }}
                                            >
                                                <option value="">Select customer...</option>
                                                {customers.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setAddingCustomer(true)}
                                                className="btn btn-outline"
                                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                                                title="Add new customer"
                                            >
                                                + New
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="text"
                                                autoFocus
                                                value={newCustomerInput}
                                                onChange={e => setNewCustomerInput(e.target.value)}
                                                placeholder="New customer name"
                                                style={{ flex: 1, padding: '0.55rem 0.75rem', background: 'var(--bg-dark)', border: '1px solid var(--primary)', borderRadius: '0.375rem', color: 'white', fontSize: '0.9rem' }}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewCustomer(); } }}
                                            />
                                            <button type="button" onClick={handleAddNewCustomer} className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>Add</button>
                                            <button type="button" onClick={() => { setAddingCustomer(false); setNewCustomerInput(''); }} className="btn btn-outline" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>✕</button>
                                        </div>
                                    )}
                                </div>

                                {/* Customer Order Number */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Customer Order # <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                                    <input
                                        type="text"
                                        value={newCustomerOrderNum}
                                        onChange={e => setNewCustomerOrderNum(e.target.value)}
                                        placeholder="Customer's own PO / order number"
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white', fontSize: '0.9rem' }}
                                    />
                                </div>

                                {/* Internal SO Number */}
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Internal SO Number</label>
                                    <input
                                        type="text"
                                        value={newSoNumber}
                                        onChange={e => setNewSoNumber(e.target.value)}
                                        placeholder="e.g. SO-2024-001"
                                        required
                                        style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white', fontSize: '0.9rem' }}
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

    // Production modal state
    const [produceModal, setProduceModal] = useState<null | { item: any; soldQty: number }>(null);
    const [produceQty, setProduceQty] = useState(0);
    const [produceWarehouse, setProduceWarehouse] = useState('');
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [producing, setProducing] = useState(false);

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

    async function handleProduce(item: any, soldQty: number) {
        // Load warehouses on demand
        if (warehouses.length === 0) {
            const wRes = await getWarehouses();
            if (wRes.success && wRes.data) setWarehouses(wRes.data);
        }
        setProduceQty(soldQty);
        setProduceWarehouse('');
        setProduceModal({ item, soldQty });
    }

    async function handleConfirmProduce() {
        if (!produceModal) return;
        const { item, soldQty } = produceModal;
        if (!produceWarehouse) {
            showAlert('Select a destination warehouse', 'warning');
            return;
        }
        if (produceQty < soldQty) {
            showAlert(`Production quantity cannot be less than sold quantity (${soldQty})`, 'warning');
            return;
        }
        let serials: string[] = [];
        if (item.isSerialized) {
            const input = prompt(`Enter ${produceQty} Serial Numbers (comma separated):`);
            if (!input) return;
            serials = input.split(',').map((s: string) => s.trim()).filter(Boolean);
            if (serials.length !== produceQty) {
                showAlert(`Expected ${produceQty} serial numbers, got ${serials.length}`, 'warning');
                return;
            }
        }
        setProducing(true);
        const surplus = produceQty - soldQty;
        const res = await runProduction(item.id, produceQty, serials, parseInt(produceWarehouse));
        setProducing(false);
        if (res.success) {
            setProduceModal(null);
            showAlert(
                surplus > 0
                    ? `Production complete! ${soldQty} units will be sold. ${surplus} surplus unit(s) stay in stock.`
                    : 'Production complete! Stock updated.',
                'success'
            );
            onUpdate();
        } else {
            showAlert('Production failed: ' + res.error, 'error');
        }
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

    // Procurement Wizard helpers — grouped by supplier
    const wizardGrouped = new Map<string, any[]>();
    for (const s of (wizardShortages ?? [])) {
        const supplier = (s.item.brand?.trim()) || 'Unspecified Supplier';
        if (!wizardGrouped.has(supplier)) wizardGrouped.set(supplier, []);
        wizardGrouped.get(supplier)!.push(s);
    }
    const wizardSupplierList = Array.from(wizardGrouped.entries()).sort(([a], [b]) => a.localeCompare(b));

    function handleWizardPrint() {
        const win = window.open('', '_blank', 'width=900,height=700');
        if (!win) return;
        const rows = wizardSupplierList.map(([supplier, sitems]) => `
            <tr style="background:#1e293b;"><td colspan="4" style="padding:0.6rem 1rem;font-weight:700;font-size:1.05rem;border-top:2px solid #334155;color:#e2e8f0">${supplier}</td></tr>
            ${sitems.map((s: any) => `<tr>
                <td style="padding:0.5rem 1rem;border-bottom:1px solid #334155">
                    <div style="font-weight:600;color:#e2e8f0">${s.item.name}</div>
                    <div style="font-size:0.8rem;color:#64748b">${s.item.sku}</div>
                </td>
                <td style="padding:0.5rem 1rem;text-align:right;border-bottom:1px solid #334155;color:#e2e8f0">${s.requiredQty}</td>
                <td style="padding:0.5rem 1rem;text-align:right;color:#10b981;border-bottom:1px solid #334155">${s.available}</td>
                <td style="padding:0.5rem 1rem;text-align:right;color:#ef4444;font-weight:700;border-bottom:1px solid #334155">${s.shortfall}</td>
            </tr>`).join('')}
            <tr style="background:#0f172a">
                <td style="padding:0.5rem 1rem;font-weight:600;color:#94a3b8;font-size:0.85rem">Subtotal — ${sitems.length} item(s)</td>
                <td colspan="2"></td>
                <td style="padding:0.5rem 1rem;text-align:right;font-weight:700;color:#f59e0b">${sitems.reduce((sum: number, s: any) => sum + s.shortfall, 0)}</td>
            </tr>
        `).join('');
        win.document.write(`<!DOCTYPE html><html><head><title>Procurement List — ${order.soNumber}</title>
        <style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:2rem}
        h1{font-size:1.25rem;margin-bottom:0.25rem}p{color:#94a3b8;margin-bottom:1.5rem;font-size:0.9rem}
        table{width:100%;border-collapse:collapse}th{padding:0.6rem 1rem;text-align:left;color:#94a3b8;border-bottom:2px solid #334155;font-size:0.85rem}
        th:not(:first-child){text-align:right}
        @media print{body{background:#fff;color:#000}th{color:#555!important}td{color:#000!important}}</style>
        </head><body>
        <h1>📋 Procurement Requirement List</h1>
        <p>Sales Order: <strong>${order.soNumber}</strong> &nbsp;|&nbsp; Customer: <strong>${order.customer}</strong> &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
        <table><thead><tr>
            <th>Component / SKU</th>
            <th style="text-align:right">Required</th>
            <th style="text-align:right">Available</th>
            <th style="text-align:right">Shortfall</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <script>window.onload=()=>window.print();<\/script></body></html>`);
        win.document.close();
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

    const [allPOs, setAllPOs] = useState<any[]>([]);

    useEffect(() => {
        if (showCreatePO && brands.length === 0) {
            getBrands().then(res => {
                if (res.success) setBrands(res.data || []);
            });
        }
        // Load POs for linking
        getPurchaseOrders(true).then(res => {
            if (res.success) setAllPOs(res.data || []);
        });
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
        const data = res.data.map((row: any) => {
            const current = Number(row.item.currentStock || 0);
            const allocated = Number(row.item.allocatedStock || 0);
            const available = Math.max(0, current - allocated);
            const required = row.requiredQuantity;
            const shortfall = Math.max(0, required - available);

            return {
                SKU: row.item.sku,
                Name: row.item.name,
                Brand: row.item.brand || '',
                'Base Qty': row.baseQuantity,
                'Required Qty (+10%)': required,
                'Available Stock': available,
                'Quantity to Order': shortfall
            };
        });
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
                        
                        {/* Linked Purchase Orders Section */}
                        <div className="card" style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-color)', marginTop: '2rem', padding: '1.25rem' }}>
                            <h4 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                                <Package size={18} /> Linked Purchase Orders
                            </h4>
                            
                            {order.purchaseOrders && order.purchaseOrders.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                    {order.purchaseOrders.map((po: any) => (
                                        <div key={po.id} style={{ 
                                            padding: '0.6rem 0.875rem', 
                                            background: 'rgba(59, 130, 246, 0.12)', 
                                            border: '1px solid rgba(59, 130, 246, 0.25)',
                                            borderRadius: 'var(--radius-md)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            fontSize: '0.9rem'
                                        }}>
                                            <span style={{ fontWeight: 600 }}>{po.poNumber}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{po.status}</span>
                                            <button 
                                                onClick={async () => {
                                                    showConfirm(`Unlink PO ${po.poNumber}?`, async () => {
                                                        const res = await updatePOLinkedSO(po.id, null);
                                                        if (res.success) {
                                                            showAlert('PO unlinked', 'success');
                                                            onUpdate();
                                                        } else {
                                                            showAlert(res.error || 'Failed to unlink', 'error');
                                                        }
                                                    });
                                                }}
                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                                                title="Unlink from this SO"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem', fontStyle: 'italic' }}>
                                    No Purchase Orders officially linked to this SO yet.
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                                <div style={{ flex: 1 }}>
                                    <select 
                                        className="input-group"
                                        style={{ margin: 0, width: '100%', padding: '0.55rem' }}
                                        onChange={async (e) => {
                                            if (!e.target.value) return;
                                            const poId = parseInt(e.target.value);
                                            const res = await updatePOLinkedSO(poId, order.id);
                                            if (res.success) {
                                                showAlert('PO linked successfully', 'success');
                                                onUpdate();
                                            } else {
                                                showAlert(res.error || 'Failed to link PO', 'error');
                                            }
                                            e.target.value = '';
                                        }}
                                    >
                                        <option value="">Link existing PO...</option>
                                        {allPOs && allPOs.length > 0 ? (
                                            allPOs.filter(po => po.salesOrderId !== order.id).map(po => (
                                                <option key={po.id} value={po.id}>{po.poNumber} ({po.supplier})</option>
                                            ))
                                        ) : (
                                            <option disabled>Loading or no other POs found...</option>
                                        )}
                                    </select>
                                </div>
                                <button 
                                    className="btn btn-outline" 
                                    style={{ whiteSpace: 'nowrap', padding: '0.55rem 1rem' }}
                                    onClick={() => setShowCreatePO(true)}
                                >
                                    + New PO
                                </button>
                            </div>
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
                    <div className="card" style={{ width: '760px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

                        {/* Header */}
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-dark)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ marginBottom: '0.25rem' }}>🔮 Procurement Wizard</h3>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>BOM requirements vs. available stock for {order.soNumber}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                {(wizardShortages ?? []).length > 0 && (
                                    <button
                                        onClick={handleWizardPrint}
                                        className="btn btn-outline"
                                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                        title="Print procurement list"
                                    >
                                        🖨️ Print
                                    </button>
                                )}
                                <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {wizardLoading ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Analysing BOM requirements...</div>
                            ) : (wizardShortages ?? []).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</div>
                                    <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#10b981' }}>All components are in stock!</div>
                                    <div style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Available stock covers all BOM requirements (incl. 10% buffer).</div>
                                </div>
                            ) : (
                                <>
                                    {/* Summary banner */}
                                    <div style={{ marginBottom: '1.25rem', padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.1)', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>⚠️ <strong>{(wizardShortages ?? []).length} component(s)</strong> short across <strong>{wizardSupplierList.length} supplier(s)</strong></span>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Grouped by supplier</span>
                                    </div>

                                    {/* Column headers */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px', padding: '0 0.875rem 0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '0.5rem' }}>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Component</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Required</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Avail</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Shortfall</div>
                                    </div>

                                    {/* Supplier groups */}
                                    {wizardSupplierList.map(([supplier, sitems]) => (
                                        <div key={supplier} style={{ marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                                            {/* Supplier header row */}
                                            <div style={{ padding: '0.55rem 0.875rem', background: 'rgba(99,102,241,0.12)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#818cf8' }}>🏭 {supplier}</span>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {sitems.length} item(s) &nbsp;·&nbsp;
                                                    <span style={{ color: '#f87171', fontWeight: 600 }}>
                                                        {sitems.reduce((sum: number, s: any) => sum + s.shortfall, 0)} shortfall
                                                    </span>
                                                </span>
                                            </div>
                                            {/* Items */}
                                            {sitems.map((s: any, idx: number) => (
                                                <div key={s.item.id} style={{
                                                    display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px',
                                                    padding: '0.55rem 0.875rem',
                                                    borderBottom: idx < sitems.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                                                    alignItems: 'center'
                                                }}>
                                                    <div>
                                                        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{s.item.name}</div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{s.item.sku}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontWeight: 500, fontSize: '0.875rem' }}>{s.requiredQty}</div>
                                                    <div style={{ textAlign: 'right', color: '#10b981', fontWeight: 500, fontSize: '0.875rem' }}>{s.available}</div>
                                                    <div style={{ textAlign: 'right', color: '#ef4444', fontWeight: 700 }}>{s.shortfall}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        {(wizardShortages ?? []).length > 0 && (
                            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-dark)' }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Creates <strong style={{ color: 'var(--text-main)' }}>{wizardSupplierList.length} PO(s)</strong> — one per supplier
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button className="btn btn-outline" onClick={() => setShowWizard(false)}>Cancel</button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleAutoProcure}
                                        disabled={wizardProcuring}
                                        style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                                    >
                                        {wizardProcuring ? 'Generating POs...' : `⚡ Auto-Generate ${wizardSupplierList.length} PO(s)`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Produce Modal */}
            {produceModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90 }}>
                    <div className="card" style={{ width: '420px', maxWidth: '90%' }} onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '0.5rem' }}>Produce {produceModal.item.name}</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Specify how many units to produce. The required {produceModal.soldQty} units will be allocated to this order, and any surplus will be returned to the warehouse.
                        </p>
                        
                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                            <label>Production Quantity</label>
                            <input
                                type="number"
                                className="input-group"
                                value={produceQty}
                                onChange={e => setProduceQty(parseInt(e.target.value) || 0)}
                                min={produceModal.soldQty}
                                style={{ width: '100%', padding: '0.6rem', fontSize: '1.2rem', fontWeight: 'bold' }}
                            />
                            {produceQty > produceModal.soldQty && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#10b981' }}>
                                    + {produceQty - produceModal.soldQty} units surplus for stock
                                </div>
                            )}
                        </div>

                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label>Destination Warehouse (for surplus/records)</label>
                            <select
                                className="input-group"
                                value={produceWarehouse}
                                onChange={e => setProduceWarehouse(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem' }}
                            >
                                <option value="">Select a warehouse...</option>
                                {warehouses.map(w => (
                                    <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button className="btn btn-outline" onClick={() => setProduceModal(null)} disabled={producing}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleConfirmProduce} disabled={producing}>
                                {producing ? 'Producing...' : `Produce ${produceQty}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
