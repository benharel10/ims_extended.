'use client'

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPurchaseOrder, addPOLine, removePOLine, updatePOStatus, getItems, updatePOLine, updatePODueDate, updatePONumber, getPOHistory, getWarehouses, receivePOItems, updatePOLinkedSO, generateInspectionReports, searchItems, getDraftSalesOrders } from '../actions';
import { createInspectionRecord } from '../../quality/actions';
import { getSalesOrders } from '@/app/sales/actions';
import { Plus, Trash2, Save, ArrowLeft, Package, Zap, History, FileSpreadsheet, ShieldCheck, ShieldAlert, Upload, Check, X, Search, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSystem } from '@/components/SystemProvider';
import { useDebounce } from '@/hooks/useDebounce';

function EditablePOLine({ line, po, handleRemoveLine, handleUpdateLine, handleShowUploadQC }: any) {
    const isDraft = po.status !== 'Completed' && po.status !== 'Partial';
    const pending = line.quantity - line.received;
    const isComplete = pending <= 0;
    
    // Check if there is an inspection record for this item in this PO
    const qcRecords = po.inspectionRecords || [];
    const record = qcRecords.find((r: any) => r.itemId === line.itemId);
    
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                    <button 
                        className="btn btn-sm"
                        onClick={() => handleShowUploadQC(line)} 
                        title={record ? `QC Passed: ${record.fileName}` : "Upload Inspection Report"}
                        style={{ 
                            padding: '0.25rem', 
                            height: '32px', 
                            width: '32px',
                            minWidth: '32px',
                            background: 'transparent',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {record?.status === 'Fail' ? (
                            <ShieldAlert size={20} color="#ef4444" fill="rgba(239, 68, 68, 0.1)" />
                        ) : (
                            <ShieldCheck 
                                size={20} 
                                style={{ 
                                    color: record ? 'var(--primary)' : 'var(--text-muted)',
                                    opacity: record ? 1 : 0.2,
                                    strokeWidth: record ? 2.5 : 1.5
                                }} 
                                fill={record ? 'var(--primary-light)' : 'transparent'}
                            />
                        )}
                    </button>
                </div>
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
    const [isGeneratingReports, setIsGeneratingReports] = useState(false);

    const [showQUploadModal, setShowQUploadModal] = useState(false);
    const [selectedLine, setSelectedLine] = useState<any>(null);
    const [qcStatus, setQcStatus] = useState('Pass');
    const [qcNotes, setQcNotes] = useState('');
    const [isUploadingQC, setIsUploadingQC] = useState(false);
    const qcInputRef = React.useRef<HTMLInputElement>(null);

    // Add Line State
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [itemSearch, setItemSearch] = useState('');
    const [itemSearchResults, setItemSearchResults] = useState<any[]>([]);
    const [selectedItemData, setSelectedItemData] = useState<any>(null);
    const [isSearchingItems, setIsSearchingItems] = useState(false);
    const debouncedItemSearch = useDebounce(itemSearch, 500);

    // New Item State
    const [isNewItem, setIsNewItem] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemSku, setNewItemSku] = useState('');
    const [newItemCost, setNewItemCost] = useState(0);

    useEffect(() => {
        loadData();
    }, [poId]);

    // Live search effect — only fires after user stops typing for 500ms
    useEffect(() => {
        if (debouncedItemSearch.length >= 2) {
            setIsSearchingItems(true);
            searchItems(debouncedItemSearch).then(res => {
                if (res.success && res.data) setItemSearchResults(res.data);
                setIsSearchingItems(false);
            });
        } else {
            setItemSearchResults([]);
        }
    }, [debouncedItemSearch]);

    async function loadData() {
        setLoading(true);
        const [poRes, whRes, soRes] = await Promise.all([
            getPurchaseOrder(poId),
            getWarehouses(),
            getDraftSalesOrders()
        ]);

        if (poRes.success && poRes.data) {
            setPo(poRes.data);
        } else {
            showAlert('PO not found', 'error');
            router.push('/purchasing');
        }

        if (whRes.success && whRes.data) {
            setWarehouses(whRes.data);
            if (whRes.data.length > 0) setSelectedWarehouseId(whRes.data[0].id.toString());
        }
        if (soRes.success && soRes.data) {
            setSalesOrders(soRes.data);
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
            if (!selectedItemData) {
                showAlert('Please select an item from the search results.', 'warning');
                return;
            }
            cost = Number(selectedItemData.cost);
            itemId = selectedItemData.id;
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
            setSelectedItemData(null);
            setItemSearch('');
            setItemSearchResults([]);
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

    async function handleConfirmReceiptPreCheck() {
        setShowReceiveModal(true);
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

    async function handleDownloadReports() {
        setIsGeneratingReports(true);
        const res = await generateInspectionReports(poId);
        setIsGeneratingReports(false);

        if (res.success && res.data) {
            const { base64, fileName } = res.data;
            const link = document.createElement('a');
            link.href = `data:application/zip;base64,${base64}`;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showAlert('Reports generated successfully', 'success');
        } else {
            showAlert(res.error || 'Failed to generate reports', 'error');
        }
    }

    function handleShowUploadQC(line: any) {
        if (!line.itemId) {
            showAlert('This item is not in the inventory system. Map it first to record QC.', 'info');
            return;
        }
        setSelectedLine(line);
        setQcStatus('Pass');
        setQcNotes('');
        setShowQUploadModal(true);
    }

    async function handleSaveQC(e: React.FormEvent) {
        e.preventDefault();
        const file = qcInputRef.current?.files?.[0];
        if (!file) {
            showAlert('Please select a file to upload', 'warning');
            return;
        }
        setIsUploadingQC(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            const res = await createInspectionRecord({
                itemId: selectedLine.itemId,
                poId: poId,
                fileName: file.name,
                fileData: base64,
                status: qcStatus,
                notes: qcNotes
            });

            if (res.success) {
                showAlert('Inspection record saved', 'success');
                setShowQUploadModal(false);
                loadData(); // Reload to show badge
            } else {
                showAlert(res.error || 'Failed to save record', 'error');
            }
            setIsUploadingQC(false);
        };
        reader.readAsDataURL(file);
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
                {po.status !== 'Completed' && ` (${isOverdue ? `Overdue by ${Math.abs(daysLeft)} days` : `${daysLeft} days left`})`}
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
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                        gap: '1.5rem', 
                        marginTop: '1rem',
                        padding: '1rem',
                        background: 'var(--bg-dark)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier</label>
                            <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{po.supplier}</span>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order Date</label>
                            <span style={{ fontWeight: 500 }}>{po.orderDate ? new Date(po.orderDate).toLocaleDateString() : new Date(po.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</label>
                            {po.status !== 'Completed' && po.status !== 'Partial' ? (
                                <input 
                                    type="date"
                                    className="input-group"
                                    style={{ padding: '0.4rem 0.75rem', margin: 0, width: '100%', maxWidth: '200px' }}
                                    defaultValue={po.dueDate ? new Date(po.dueDate).toISOString().split('T')[0] : ''}
                                    onBlur={async (e) => {
                                        const current = po.dueDate ? new Date(po.dueDate).toISOString().split('T')[0] : '';
                                        if (e.target.value !== current && e.target.value !== '') {
                                            handleUpdateDueDate(e.target.value);
                                        }
                                    }}
                                />
                            ) : (
                                <span style={{ fontWeight: 500 }}>{dueElement}</span>
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Linked Sales Order</label>
                            {po.status !== 'Completed' && po.status !== 'Partial' ? (
                                <>
                                    <select 
                                        className="input-group"
                                        style={{ padding: '0.4rem 0.75rem', margin: 0, width: '100%', maxWidth: '200px' }}
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
                                        <option value="">None (Standalone)</option>
                                        {salesOrders && salesOrders.length > 0 ? (
                                            salesOrders.map(so => (
                                                <option key={so.id} value={so.id}>{so.soNumber} - {so.customer}</option>
                                            ))
                                        ) : (
                                            <option disabled>No Draft Sales Orders found</option>
                                        )}
                                    </select>
                                    {po.salesOrderId && (
                                        <div style={{ marginTop: '0.5rem' }}>
                                            <Link 
                                                href={`/sales?id=${po.salesOrderId}`} 
                                                style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                            >
                                                View Sales Order {po.salesOrder?.soNumber}
                                            </Link>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                    {po.salesOrder ? (
                                        <Link href={`/sales?id=${po.salesOrderId}`} style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                                            {po.salesOrder.soNumber}
                                        </Link>
                                    ) : 'None'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn btn-outline" onClick={handleDownloadReports} disabled={isGeneratingReports} title="Download Inspection Reports (FAI)">
                        {isGeneratingReports ? <span className="animate-spin mr-2">⏳</span> : <FileSpreadsheet size={18} style={{ marginRight: '0.5rem' }} />}
                        {isGeneratingReports ? 'Generating...' : 'Download FAI files'}
                    </button>
                    <button className="btn btn-outline" onClick={handleViewHistory} title="View Audit Logs">
                        <History size={18} />
                    </button>
                    {po.status === 'Draft' && (
                        <button className="btn btn-outline" onClick={() => handleStatusChange('Sent')}>
                            Mark as Sent
                        </button>
                    )}
                    {po.status !== 'Completed' && (
                        <button className="btn btn-primary" onClick={handleConfirmReceiptPreCheck}>
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
                                <div style={{ position: 'relative' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                        Item {selectedItemId ? <span style={{ color: 'var(--success)', marginLeft: '0.5rem' }}>✓ Selected</span> : '(type to search)'}
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                                        {isSearchingItems && <Loader2 size={16} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />}
                                        <input
                                            type="text"
                                            className="input-group"
                                            placeholder="Search SKU or Name..."
                                            value={itemSearch}
                                            onChange={e => {
                                                setItemSearch(e.target.value);
                                                if (!e.target.value) setSelectedItemId('');
                                            }}
                                            style={{ paddingLeft: '2.25rem' }}
                                        />
                                    </div>
                                    {itemSearchResults.length > 0 && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-md)', maxHeight: '200px', overflowY: 'auto',
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: '2px'
                                        }}>
                                            {itemSearchResults.map(item => (
                                                <div
                                                    key={item.id}
                                                    onClick={() => {
                                                        setSelectedItemId(item.id.toString());
                                                        setSelectedItemData(item);
                                                        setItemSearch(`${item.sku} — ${item.name}`);
                                                        setItemSearchResults([]);
                                                    }}
                                                    style={{
                                                        padding: '0.65rem 1rem', cursor: 'pointer',
                                                        borderBottom: '1px solid var(--border-color)',
                                                        background: selectedItemId === item.id.toString() ? 'var(--bg-hover)' : 'transparent',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = selectedItemId === item.id.toString() ? 'var(--bg-hover)' : 'transparent')}
                                                >
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.sku}</span>
                                                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>— {item.name}</span>
                                                    <span style={{ float: 'right', color: 'var(--text-muted)' }}>${Number(item.cost).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
                                            handleShowUploadQC={handleShowUploadQC}
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
            {/* QC Upload Modal */}
            {showQUploadModal && (
                <div className="modal-overlay" onClick={() => !isUploadingQC && setShowQUploadModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <ShieldCheck size={24} color="var(--primary)" />
                                Record Inspection (FA)
                            </h2>
                            <button className="btn btn-outline" onClick={() => setShowQUploadModal(false)} disabled={isUploadingQC}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '1.5rem', background: 'var(--bg-dark)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Item</div>
                            <div style={{ fontWeight: 600 }}>{selectedLine?.item?.sku || selectedLine?.newItemSku}</div>
                            <div style={{ fontSize: '0.9rem' }}>{selectedLine?.item?.name || selectedLine?.newItemName}</div>
                        </div>

                        <form onSubmit={handleSaveQC}>
                            <div className="form-group">
                                <label>Report File (Completed Excel/PDF)</label>
                                <input 
                                    type="file" 
                                    className="input-group" 
                                    ref={qcInputRef} 
                                    disabled={isUploadingQC}
                                    style={{ padding: '0.5rem' }}
                                />
                            </div>

                            <div className="form-group">
                                <label>Overall Inspection Result</label>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <label style={{ 
                                        flex: 1, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '0.5rem', 
                                        padding: '0.75rem', 
                                        borderRadius: '8px', 
                                        border: `2px solid ${qcStatus === 'Pass' ? 'var(--primary)' : 'var(--border-color)'}`,
                                        background: qcStatus === 'Pass' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                        cursor: 'pointer'
                                    }}>
                                        <input type="radio" style={{ display: 'none' }} name="status" value="Pass" checked={qcStatus === 'Pass'} onChange={() => setQcStatus('Pass')} />
                                        <Check size={18} color={qcStatus === 'Pass' ? 'var(--primary)' : 'gray'} />
                                        <span>PASS</span>
                                    </label>
                                    <label style={{ 
                                        flex: 1, 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'center', 
                                        gap: '0.5rem', 
                                        padding: '0.75rem', 
                                        borderRadius: '8px', 
                                        border: `2px solid ${qcStatus === 'Fail' ? '#ef4444' : 'var(--border-color)'}`,
                                        background: qcStatus === 'Fail' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                        cursor: 'pointer'
                                    }}>
                                        <input type="radio" style={{ display: 'none' }} name="status" value="Fail" checked={qcStatus === 'Fail'} onChange={() => setQcStatus('Fail')} />
                                        <X size={18} color={qcStatus === 'Fail' ? '#ef4444' : 'gray'} />
                                        <span>FAIL</span>
                                    </label>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notes / Observations</label>
                                <textarea 
                                    className="input-group" 
                                    rows={3} 
                                    placeholder="Add any specific measurement comments or reasons for failure..."
                                    value={qcNotes}
                                    onChange={e => setQcNotes(e.target.value)}
                                    disabled={isUploadingQC}
                                ></textarea>
                            </div>

                            <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-outline" onClick={() => setShowQUploadModal(false)} disabled={isUploadingQC}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={isUploadingQC}>
                                    {isUploadingQC ? 'Uploading...' : 'Save Inspection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
}
