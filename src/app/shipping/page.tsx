'use client'

import React, { useState, useEffect } from 'react';
import { Truck, Box, Plus, Package as PackageIcon, Trash2, ChevronDown, ChevronRight, Save, Printer, Building, ArrowRightLeft } from 'lucide-react';
import { getShipments, createShipment, createPackage, addItemToPackage, deletePackage, removeItemFromPackage, updateShipmentStatus, getAvailableSerialNumbers, deleteShipment, bulkDeleteShipments, getWarehouses, createWarehouse, deleteWarehouse, completeTransfer } from './actions';
import { getItems } from '../inventory/actions'; // Reuse getItems
import { useSystem } from '@/components/SystemProvider';

export default function ShippingPage() {
    const { user, showAlert, showConfirm } = useSystem();
    const isAdmin = user?.role === 'Admin';
    const [shipments, setShipments] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedShipmentId, setExpandedShipmentId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | 'carrier' | 'local' | 'transfer'>('all');

    // Warehouses State
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [showWarehouseModal, setShowWarehouseModal] = useState(false);
    const [newWarehouseData, setNewWarehouseData] = useState({ name: '', location: '', type: 'Standard' });

    // New Shipment State
    const [showNewModal, setShowNewModal] = useState(false);
    const [shipmentType, setShipmentType] = useState<'carrier' | 'local' | 'transfer'>('carrier');
    const [newShipmentData, setNewShipmentData] = useState({
        shipmentNo: '', carrier: '', trackingNo: '', driverName: '', vehiclePlate: '',
        fromWarehouseId: '', toWarehouseId: ''
    });

    // Add Item State (Transient)
    const [addingItemToPkg, setAddingItemToPkg] = useState<number | null>(null); // Package ID
    const [selectedItemToAdd, setSelectedItemToAdd] = useState('');
    const [qtyToAdd, setQtyToAdd] = useState(1);
    const [availableSerials, setAvailableSerials] = useState<any[]>([]);
    const [selectedSerialId, setSelectedSerialId] = useState('');
    const [isSerializedSelection, setIsSerializedSelection] = useState(false);

    // Selection State
    const [selectedShipmentIds, setSelectedShipmentIds] = useState<Set<number>>(new Set());

    function toggleSelectShipment(id: number) {
        const next = new Set(selectedShipmentIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedShipmentIds(next);
    }

    function toggleSelectAllShipments() {
        if (selectedShipmentIds.size === filteredShipments.length) {
            setSelectedShipmentIds(new Set());
        } else {
            setSelectedShipmentIds(new Set(filteredShipments.map(s => s.id)));
        }
    }

    async function handleDeleteShipment(id: number) {
        showConfirm('Are you sure you want to delete this shipment?', async () => {
            const res = await deleteShipment(id);
            if (res.success) {
                loadData();
                showAlert('Shipment deleted', 'success');
            } else {
                showAlert(res.error || 'Failed to delete shipment', 'error');
            }
        });
    }

    async function handleBulkDeleteShipments() {
        showConfirm(`Delete ${selectedShipmentIds.size} shipments?`, async () => {
            const res = await bulkDeleteShipments(Array.from(selectedShipmentIds));
            if (res.success) {
                setSelectedShipmentIds(new Set());
                loadData();
                showAlert('Shipments deleted', 'success');
            } else {
                showAlert(res.error || 'Failed to delete shipments', 'error');
            }
        });
    }

    // Printing State
    const [printingShipment, setPrintingShipment] = useState<any | null>(null);

    // Helper to open Add Item form cleanly
    function openAddItem(pkgId: number) {
        setAddingItemToPkg(pkgId);
        setSelectedItemToAdd('');
        setQtyToAdd(1);
        setAvailableSerials([]);
        setSelectedSerialId('');
        setIsSerializedSelection(false);
    }

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [shipRes, itemRes, whRes] = await Promise.all([getShipments(), getItems(), getWarehouses()]);

        if (shipRes.success) setShipments(shipRes.data || []);
        if (itemRes.success) setItems(itemRes.data || []);
        if (whRes.success) setWarehouses(whRes.data || []);

        setLoading(false);
    }

    async function handleCreateShipment() {
        if (!newShipmentData.shipmentNo) {
            showAlert('Shipment Number is required', 'warning');
            return;
        }

        let finalCarrier = newShipmentData.carrier;
        let finalTracking = newShipmentData.trackingNo;

        if (shipmentType === 'local') {
            if (!newShipmentData.driverName) {
                showAlert('Driver Name is required', 'warning');
                return;
            }
            finalCarrier = `Local: ${newShipmentData.driverName}`;
            finalTracking = newShipmentData.vehiclePlate || 'N/A';
        } else if (shipmentType === 'transfer') {
            if (!newShipmentData.fromWarehouseId || !newShipmentData.toWarehouseId) {
                showAlert('Source and Destination Warehouses are required', 'warning');
                return;
            }
            if (newShipmentData.fromWarehouseId === newShipmentData.toWarehouseId) {
                showAlert('Source and Destination must be different', 'warning');
                return;
            }
            finalCarrier = 'Internal Transfer';
            finalTracking = 'N/A';
        }

        const res = await createShipment({
            shipmentNo: newShipmentData.shipmentNo,
            carrier: finalCarrier,
            trackingNo: finalTracking,
            type: shipmentType === 'transfer' ? 'Transfer' : 'Outbound',
            fromWarehouseId: shipmentType === 'transfer' ? parseInt(newShipmentData.fromWarehouseId) : undefined,
            toWarehouseId: shipmentType === 'transfer' ? parseInt(newShipmentData.toWarehouseId) : undefined
        });

        if (res.success) {
            setShowNewModal(false);
            setNewShipmentData({
                shipmentNo: '', carrier: '', trackingNo: '', driverName: '', vehiclePlate: '',
                fromWarehouseId: '', toWarehouseId: ''
            });
            loadData();
            showAlert('Shipment created', 'success');
        } else {
            showAlert('Failed to create shipment: ' + (res.error || 'Unknown error'), 'error');
        }
    }

    async function handleCreateWarehouse() {
        if (!newWarehouseData.name) {
            showAlert('Warehouse Name is required', 'warning');
            return;
        }
        const res = await createWarehouse(newWarehouseData);
        if (res.success) {
            setNewWarehouseData({ name: '', location: '', type: 'Standard' });
            loadData(); // Reloads warehouses list
            showAlert('Warehouse added', 'success');
        } else {
            showAlert(res.error || 'Failed to create warehouse', 'error');
        }
    }

    async function handleDeleteWarehouse(id: number) {
        showConfirm('Delete warehouse?', async () => {
            const res = await deleteWarehouse(id);
            if (res.success) {
                loadData();
                showAlert('Warehouse deleted', 'success');
            } else {
                showAlert(res.error || 'Failed to delete warehouse', 'error');
            }
        });
    }

    async function handleCompleteTransfer(shipmentId: number) {
        showConfirm('This will move stock from source to destination warehouse. Continue?', async () => {
            const res = await completeTransfer(shipmentId);
            if (res.success) {
                showAlert('Transfer Completed Successfully', 'success');
                loadData();
            } else {
                showAlert('Transfer Failed: ' + (res.error || 'Unknown error'), 'error');
            }
        });
    }

    async function handleAddPackage(shipmentId: number) {
        await createPackage(shipmentId);
        loadData();
    }

    async function handleAddItem(packageId: number) {
        if (!selectedItemToAdd) {
            showAlert('Please select an item', 'warning');
            return;
        }

        const qty = Number(qtyToAdd);
        if (isNaN(qty) || qty <= 0) {
            showAlert('Please enter a valid quantity', 'warning');
            return;
        }

        if (isSerializedSelection && !selectedSerialId) {
            showAlert('Please select a serial number', 'warning');
            return;
        }

        try {
            const res = await addItemToPackage(
                packageId,
                parseInt(selectedItemToAdd),
                qty,
                selectedSerialId ? parseInt(selectedSerialId) : undefined
            );

            if (res.success) {
                setAddingItemToPkg(null);
                setSelectedItemToAdd('');
                setQtyToAdd(1);
                setAvailableSerials([]);
                setSelectedSerialId('');
                setIsSerializedSelection(false);
                loadData();
                showAlert('Item added to package', 'success');
            } else {
                showAlert('Server Error: ' + (res.error || 'Unknown error'), 'error');
            }
        } catch (err: any) {
            showAlert('Client Error: ' + err.message, 'error');
        }
    }

    // Watch for item selection to check serialization
    useEffect(() => {
        if (selectedItemToAdd) {
            const item = items.find(i => String(i.id) === selectedItemToAdd);
            if (item?.isSerialized) {
                setIsSerializedSelection(true);
                setQtyToAdd(1); // Force 1
                getAvailableSerialNumbers(item.id).then(res => {
                    if (res.success) setAvailableSerials(res.data || []);
                });
            } else {
                setIsSerializedSelection(false);
                setAvailableSerials([]);
                setSelectedSerialId('');
            }
        }
    }, [selectedItemToAdd, items]);

    function handlePrint(shipment: any) {
        setPrintingShipment(shipment);
        setTimeout(() => {
            window.print();
            // Optional: clear printing shipment after print, but keeping it is fine
        }, 300);
    }

    // Helper to generate a random Shipment # usually
    function generateShipmentNo() {
        return `SH-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    }

    const filteredShipments = shipments.filter(s => {
        const isLocal = s.carrier?.startsWith('Local:');
        const isTransfer = s.type === 'Transfer';

        if (activeTab === 'local') return isLocal;
        if (activeTab === 'carrier') return !isLocal && !isTransfer;
        if (activeTab === 'transfer') return isTransfer;
        return true;
    });

    return (

        <>
            <div className="animate-fade-in">
                <div className="hide-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h1>Shipping Management</h1>
                        <p>Manage shipments, packages, and packing lists.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn btn-outline" onClick={() => setShowWarehouseModal(true)}>
                            <Building size={18} style={{ marginRight: '0.5rem' }} />
                            Manage Warehouses
                        </button>
                        <button className="btn btn-primary" onClick={() => {
                            setNewShipmentData(prev => ({ ...prev, shipmentNo: generateShipmentNo() }));
                            setShowNewModal(true);
                        }}>
                            <Plus size={18} />
                            New Shipment
                        </button>
                    </div>
                </div>

                <div className="hide-print" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        {['all', 'carrier', 'local', 'transfer'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                style={{
                                    background: 'none', border: 'none', padding: '0.5rem 1rem', cursor: 'pointer',
                                    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                                    borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                                    fontWeight: activeTab === tab ? 600 : 400,
                                    textTransform: 'capitalize'
                                }}
                            >
                                {tab === 'local' ? 'Local / Car Delivery' : tab === 'carrier' ? 'Carrier (FedEx/DHL)' : tab === 'transfer' ? 'Inter-Warehouse Transfers' : 'All Shipments'}
                            </button>
                        ))}
                    </div>
                    {selectedShipmentIds.size > 0 && isAdmin && (
                        <button
                            className="btn btn-sm btn-outline"
                            onClick={handleBulkDeleteShipments}
                            style={{ color: '#ef4444', borderColor: '#ef4444', padding: '0.25rem 0.5rem' }}
                        >
                            <Trash2 size={14} style={{ marginRight: '0.5rem' }} /> Delete ({selectedShipmentIds.size})
                        </button>
                    )}
                </div>

                <div className="hide-print" style={{ marginBottom: '1rem', padding: '0 1rem', display: 'flex', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                        <input
                            type="checkbox"
                            onChange={toggleSelectAllShipments}
                            checked={filteredShipments.length > 0 && selectedShipmentIds.size === filteredShipments.length}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        Select All
                    </label>
                </div>

                {loading ? <div className="hide-print">Loading...</div> : (
                    <div className="space-y-4 hide-print">
                        {filteredShipments.map(shipment => (
                            <div key={shipment.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div
                                    style={{
                                        padding: '1rem',
                                        background: 'var(--bg-card)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        cursor: 'pointer',
                                        borderBottom: expandedShipmentId === shipment.id ? '1px solid var(--border-color)' : 'none'
                                    }}
                                    onClick={() => setExpandedShipmentId(expandedShipmentId === shipment.id ? null : shipment.id)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedShipmentIds.has(shipment.id)}
                                                onChange={() => toggleSelectShipment(shipment.id)}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                            />
                                        </div>
                                        {expandedShipmentId === shipment.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Truck style={{ color: 'var(--primary)' }} size={20} />
                                            <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{shipment.shipmentNo}</span>
                                        </div>
                                        <span className={`badge ${shipment.status === 'Draft' ? 'badge-warning' : 'badge-success'}`}>{shipment.status}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem', alignItems: 'center' }}>
                                        {shipment.type === 'Transfer' ? (
                                            <span style={{ color: '#f59e0b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <ArrowRightLeft size={16} />
                                                {shipment.fromWarehouse?.name} → {shipment.toWarehouse?.name}
                                            </span>
                                        ) : (
                                            <>
                                                <span>{shipment.carrier?.startsWith('Local:') ? 'Driver' : 'Carrier'}: {shipment.carrier?.replace('Local: ', '') || '-'}</span>
                                                <span>{shipment.carrier?.startsWith('Local:') ? 'Vehicle' : 'Tracking'}: {shipment.trackingNo || '-'}</span>
                                            </>
                                        )}
                                        <span>Packages: {shipment.packages.length}</span>

                                        {isAdmin && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteShipment(shipment.id); }}
                                                className="btn btn-sm btn-outline"
                                                style={{ color: '#ef4444', borderColor: '#ef4444', padding: '0.2rem', marginLeft: '1rem' }}
                                                title="Delete Shipment"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {expandedShipmentId === shipment.id && (
                                    <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.1)' }}>
                                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <h3>Packages</h3>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                {shipment.type === 'Transfer' && shipment.status !== 'Completed' && (
                                                    <button className="btn btn-sm btn-success" onClick={(e) => { e.stopPropagation(); handleCompleteTransfer(shipment.id); }} style={{ background: '#10b981', color: 'white', border: 'none' }}>
                                                        <ArrowRightLeft size={14} style={{ marginRight: '0.5rem' }} /> Complete Transfer
                                                    </button>
                                                )}
                                                <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); handlePrint(shipment); }}>
                                                    <Printer size={14} style={{ marginRight: '0.5rem' }} /> Print Packing List
                                                </button>
                                                <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleAddPackage(shipment.id); }}>
                                                    <Plus size={14} style={{ marginRight: '0.5rem' }} /> Add Box
                                                </button>
                                            </div>
                                        </div>

                                        {shipment.packages.length === 0 && <div className="text-muted">No packages added.</div>}

                                        <div className="grid grid-cols-1 gap-4">
                                            {shipment.packages.map((pkg: any, idx: number) => {
                                                const sourceWarehouseId = shipment.fromWarehouseId;
                                                return (
                                                    <div key={pkg.id} style={{ border: '1px solid var(--border-color)', borderRadius: '0.5rem', background: 'var(--bg-card)', padding: '1rem' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                <Box size={16} />
                                                                <span style={{ fontWeight: 600 }}>Box #{idx + 1}</span>
                                                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>({pkg.type})</span>
                                                            </div>
                                                            {isAdmin && (
                                                                <button onClick={() => deletePackage(pkg.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <table style={{ width: '100%', fontSize: '0.9rem' }}>
                                                            <thead>
                                                                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                                                                    <th>Item</th>
                                                                    <th style={{ width: '60px' }}>Qty</th>
                                                                    <th style={{ width: '40px' }}></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {pkg.items.map((pItem: any) => (
                                                                    <tr key={pItem.id}>
                                                                        <td style={{ padding: '0.25rem 0', color: 'var(--text-main)' }}>{pItem.item.sku} - {pItem.item.name}</td>
                                                                        <td style={{ color: 'var(--text-main)' }}>{pItem.quantity}</td>
                                                                        <td>
                                                                            {isAdmin && (
                                                                                <button onClick={() => removeItemFromPackage(pItem.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                                {addingItemToPkg === pkg.id ? (
                                                                    <tr>
                                                                        <td colSpan={3} style={{ paddingTop: '0.5rem' }}>
                                                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                                                <select
                                                                                    value={selectedItemToAdd}
                                                                                    onChange={e => setSelectedItemToAdd(e.target.value)}
                                                                                    className="input-group"
                                                                                    style={{ flex: 1, padding: '0.25rem' }}
                                                                                >
                                                                                    <option value="">Select Item...</option>
                                                                                    {items.map(i => {
                                                                                        let stockLabel = `Total: ${i.currentStock}`;
                                                                                        let available = i.currentStock;

                                                                                        if (sourceWarehouseId && i.stocks) {
                                                                                            const whStock = i.stocks.find((s: any) => s.warehouseId === sourceWarehouseId)?.quantity || 0;
                                                                                            stockLabel = `WH Stock: ${whStock} (Total: ${i.currentStock})`;
                                                                                            available = whStock;
                                                                                        }

                                                                                        // Optional: Disable if 0 stock in source warehouse for transfers?
                                                                                        // const disabled = sourceWarehouseId && available <= 0;

                                                                                        return (
                                                                                            <option key={i.id} value={i.id}>
                                                                                                {i.sku} - {i.name} ({stockLabel})
                                                                                            </option>
                                                                                        );
                                                                                    })}
                                                                                </select>

                                                                                {isSerializedSelection ? (
                                                                                    <select
                                                                                        value={selectedSerialId}
                                                                                        onChange={e => setSelectedSerialId(e.target.value)}
                                                                                        className="input-group"
                                                                                        style={{ width: '150px', padding: '0.25rem' }}
                                                                                    >
                                                                                        <option value="">Select S/N...</option>
                                                                                        {availableSerials.map(s => <option key={s.id} value={s.id}>{s.sn}</option>)}
                                                                                    </select>
                                                                                ) : (
                                                                                    <input
                                                                                        type="number"
                                                                                        value={qtyToAdd}
                                                                                        onChange={e => setQtyToAdd(parseInt(e.target.value))}
                                                                                        style={{ width: '60px' }}
                                                                                        className="input-group"
                                                                                    />
                                                                                )}
                                                                                <button onClick={() => handleAddItem(pkg.id)} className="btn btn-sm btn-primary">Save</button>
                                                                                <button onClick={() => setAddingItemToPkg(null)} className="btn btn-sm">Cancel</button>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ) : (
                                                                    <tr>
                                                                        <td colSpan={3} style={{ paddingTop: '0.5rem' }}>
                                                                            <button
                                                                                className="btn btn-sm btn-link"
                                                                                style={{ padding: 0, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                                                                onClick={() => openAddItem(pkg.id)}
                                                                            >
                                                                                <Plus size={14} /> Add Item
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {filteredShipments.length === 0 && <div className="text-muted text-center py-10">No shipments found for this category.</div>}
                    </div>
                )}
            </div >

            {/* Printing Area (Hidden by default, shown in Print) */}
            {
                printingShipment && (
                    <div className="printable-area">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '2px solid #ccc', paddingBottom: '1rem' }}>
                            <img src="/logo.svg" alt="KSW Inventory" style={{ height: '80px' }} />
                            <h1 style={{ margin: 0, fontSize: '2rem' }}>Packing Slip</h1>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                            <div>
                                <strong>Shipment #:</strong> {printingShipment.shipmentNo}<br />
                                <strong>Date:</strong> {new Date().toLocaleDateString()}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <strong>Method:</strong> {printingShipment.carrier?.replace('Local: ', '')}<br />
                                <strong>Tracking/Ref:</strong> {printingShipment.trackingNo}
                            </div>
                        </div>

                        {printingShipment.packages.map((pkg: any, idx: number) => (
                            <div key={pkg.id} style={{ marginBottom: '2rem' }}>
                                <h2>Box #{idx + 1} <span style={{ fontSize: '0.8em', fontWeight: 'normal' }}>({pkg.type})</span></h2>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>SKU</th>
                                            <th>Description</th>
                                            <th style={{ textAlign: 'right' }}>Quantity</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pkg.items.map((pItem: any) => (
                                            <tr key={pItem.id}>
                                                <td>{pItem.item.sku}</td>
                                                <td>{pItem.item.name}</td>
                                                <td style={{ textAlign: 'right' }}>{pItem.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                )
            }

            {/* Create Modal */}
            {
                showNewModal && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2 style={{ marginBottom: '1.5rem' }}>New Shipment</h2>

                            {/* Type Toggle */}
                            <div style={{ display: 'flex', background: 'var(--bg-dark)', padding: '0.25rem', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
                                <button
                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '0.3rem', border: 'none', background: shipmentType === 'carrier' ? 'var(--primary)' : 'transparent', color: shipmentType === 'carrier' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}
                                    onClick={() => setShipmentType('carrier')}
                                >
                                    Carrier (FedEx/DHL)
                                </button>
                                <button
                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '0.3rem', border: 'none', background: shipmentType === 'local' ? 'var(--primary)' : 'transparent', color: shipmentType === 'local' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}
                                    onClick={() => setShipmentType('local')}
                                >
                                    Local / Car
                                </button>
                                <button
                                    style={{ flex: 1, padding: '0.5rem', borderRadius: '0.3rem', border: 'none', background: shipmentType === 'transfer' ? 'var(--primary)' : 'transparent', color: shipmentType === 'transfer' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}
                                    onClick={() => setShipmentType('transfer')}
                                >
                                    Transfer
                                </button>
                            </div>

                            <div className="form-group">
                                <label>Shipment No</label>
                                <input
                                    type="text"
                                    className="input-group"
                                    value={newShipmentData.shipmentNo}
                                    onChange={e => setNewShipmentData({ ...newShipmentData, shipmentNo: e.target.value })}
                                />
                            </div>

                            {shipmentType === 'carrier' && (
                                <>
                                    <div className="form-group">
                                        <label>Carrier Name</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            value={newShipmentData.carrier}
                                            placeholder="e.g. FedEx, DHL, UPS"
                                            onChange={e => setNewShipmentData({ ...newShipmentData, carrier: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Tracking Number</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            value={newShipmentData.trackingNo}
                                            onChange={e => setNewShipmentData({ ...newShipmentData, trackingNo: e.target.value })}
                                        />
                                    </div>
                                </>
                            )}

                            {shipmentType === 'local' && (
                                <div className="grid-cols-2" style={{ gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Driver Name</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            value={newShipmentData.driverName}
                                            placeholder="e.g. John Doe"
                                            onChange={e => setNewShipmentData({ ...newShipmentData, driverName: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Vehicle Plate</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            value={newShipmentData.vehiclePlate}
                                            placeholder="e.g. ABC 123"
                                            onChange={e => setNewShipmentData({ ...newShipmentData, vehiclePlate: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            {shipmentType === 'transfer' && (
                                <div className="grid-cols-2" style={{ gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Source Warehouse</label>
                                        <select
                                            className="input-group"
                                            value={newShipmentData.fromWarehouseId}
                                            onChange={e => setNewShipmentData({ ...newShipmentData, fromWarehouseId: e.target.value })}
                                        >
                                            <option value="">Select Source...</option>
                                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Destination Warehouse</label>
                                        <select
                                            className="input-group"
                                            value={newShipmentData.toWarehouseId}
                                            onChange={e => setNewShipmentData({ ...newShipmentData, toWarehouseId: e.target.value })}
                                        >
                                            <option value="">Select Destination...</option>
                                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                                <button className="btn btn-outline" onClick={() => setShowNewModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleCreateShipment}>Create Shipment</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Warehouse Management Modal */}
            {showWarehouseModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 style={{ marginBottom: '1.5rem' }}>Manage Warehouses</h2>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
                            <input
                                type="text" placeholder="Warehouse Name" className="input-group"
                                value={newWarehouseData.name} onChange={e => setNewWarehouseData({ ...newWarehouseData, name: e.target.value })}
                                style={{ flex: 2 }}
                            />
                            <input
                                type="text" placeholder="Location" className="input-group"
                                value={newWarehouseData.location} onChange={e => setNewWarehouseData({ ...newWarehouseData, location: e.target.value })}
                                style={{ flex: 2 }}
                            />
                            <select
                                className="input-group" style={{ flex: 1 }}
                                value={newWarehouseData.type} onChange={e => setNewWarehouseData({ ...newWarehouseData, type: e.target.value })}
                            >
                                <option value="Standard">Standard</option>
                                <option value="Virtual">Virtual</option>
                            </select>
                            <button className="btn btn-primary" onClick={handleCreateWarehouse}>Add</button>
                        </div>

                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                                        <th style={{ padding: '0.5rem' }}>Name</th>
                                        <th style={{ padding: '0.5rem' }}>Location</th>
                                        <th style={{ padding: '0.5rem' }}>Type</th>
                                        <th style={{ width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {warehouses.map(w => (
                                        <tr key={w.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '0.5rem' }}>{w.name}</td>
                                            <td style={{ padding: '0.5rem' }}>{w.location || '-'}</td>
                                            <td style={{ padding: '0.5rem' }}>{w.type}</td>
                                            <td>
                                                {isAdmin && (
                                                    <button onClick={() => handleDeleteWarehouse(w.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {warehouses.length === 0 && (
                                        <tr>
                                            <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No warehouses found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                            <button className="btn btn-outline" onClick={() => setShowWarehouseModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
