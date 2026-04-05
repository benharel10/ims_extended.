'use client'

import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, Plus, Upload, MoreHorizontal, X, FileSpreadsheet, Edit2, Check, MapPin, Package, History, Barcode } from 'lucide-react';
import { getItems, createItem, updateItem, deleteItem, updateStock, importBOM, importItems, updateItemCost, bulkDeleteItems, bulkUpdateStock, createAssemblyFromItems, createSaleFromInventory, getItemHistory } from './actions';
import { getWarehouses } from '../shipping/actions';
import * as XLSX from 'xlsx';
import { useSystem } from '@/components/SystemProvider';

export default function InventoryPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterBrand, setFilterBrand] = useState('');
    const [filterLowStock, setFilterLowStock] = useState(false);
    const [items, setItems] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<number[]>([]);

    const toggleRow = (id: number) => {
        setExpandedRows(prev => prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]);
    };

    // Stock Details Modal
    const [viewStockItem, setViewStockItem] = useState<any | null>(null);

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);

    // Actions Dropdown State
    const [activeActionId, setActiveActionId] = useState<number | null>(null);

    // History Modal State
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [historyItem, setHistoryItem] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState(false);

    async function openHistory(item: any) {
        setHistoryItem(item);
        setShowHistoryModal(true);
        setLoadingHistory(true);
        const res = await getItemHistory(item.id);
        if (res.success) setHistoryData(res.data || []);
        else showAlert('Failed to load history', 'error');
        setLoadingHistory(false);
    }

    // Assembly Creation Modal State
    const [showAssemblyModal, setShowAssemblyModal] = useState(false);
    const [recentImportedItems, setRecentImportedItems] = useState<any[]>([]);
    const [assemblyFormData, setAssemblyFormData] = useState({ name: '', sku: '' });

    // Sell Modal State
    const [showSellModal, setShowSellModal] = useState(false);
    const [sellFormData, setSellFormData] = useState({ sku: '', customer: '', price: 0, quantity: 1 });

    // Bulk Stock Adjustment Modal
    const [showBulkStockModal, setShowBulkStockModal] = useState(false);
    const [bulkStockWarehouse, setBulkStockWarehouse] = useState('');
    const [bulkStockQuantities, setBulkStockQuantities] = useState<{ [id: number]: number }>({});


    // File Upload Refs
    const bomInputRef = useRef<HTMLInputElement>(null);
    const itemInputRef = useRef<HTMLInputElement>(null);

    // Item Form State
    const [formData, setFormData] = useState<{
        sku: string; name: string; type: string; cost: number; price: number;
        minStock: number; revision: string; warehouse: string; brand: string;
        isSerialized: boolean; description: string; icountId: number | undefined;
        inspectionTemplateUrl: string | null; inspectionTemplateName: string | null;
    }>({
        sku: '',
        name: '',
        type: 'Raw',
        cost: 0,
        price: 0,
        minStock: 0,
        revision: '',
        warehouse: '',
        brand: '',
        isSerialized: false,
        description: '',
        icountId: undefined,
        inspectionTemplateUrl: null,
        inspectionTemplateName: null
    });

    useEffect(() => {
        loadItems();
    }, []);

    // Close actions dropdown when clicking elsewhere
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.actions-menu-container')) return;
            setActiveActionId(null);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + N: New Item
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                openCreateModal();
            }
            // / : Focus search
            if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
                e.preventDefault();
                document.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
            }
            // Escape: Close modals
            if (e.key === 'Escape') {
                setShowModal(false);
                setShowStockModal(false);
                setShowAssemblyModal(false);
                setShowSellModal(false);
                setShowBulkStockModal(false);
                setShowHistoryModal(false);
                setViewStockItem(null);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    async function loadItems() {
        setLoading(true);
        const [itemsRes, whRes] = await Promise.all([getItems(), getWarehouses()]);

        if (itemsRes.success && itemsRes.data) {
            setItems(itemsRes.data);
        }
        if (whRes.success && whRes.data) {
            setWarehouses(whRes.data);
        }
        setLoading(false);
    }

    // -- CRUD Operations --

    // -- CRUD Operations --
    const { user, showAlert, showConfirm } = useSystem();
    const isAdmin = user?.role === 'Admin';

    async function handleSubmitItem(e: React.FormEvent) {
        e.preventDefault();

        let res;
        if (isEditing && editId) {
            res = await updateItem(editId, formData);
        } else {
            res = await createItem(formData);
        }

        if (res.success) {
            setShowModal(false);
            resetForm();
            loadItems();
            showAlert(isEditing ? 'Item updated successfully' : 'Item created successfully', 'success');
        } else {
            showAlert(res.error || 'Failed to save item', 'error');
        }
    }

    async function handleDeleteItem(id: number, sku: string) {
        showConfirm(`Are you sure you want to delete item ${sku}? This cannot be undone.`, async () => {
            const res = await deleteItem(id);
            if (res.success) {
                loadItems();
                showAlert('Item deleted', 'success');
            } else {
                showAlert(res.error || 'Failed to delete item', 'error');
            }
        });
    }

    async function handleBulkDelete() {
        showConfirm(`Are you sure you want to delete ${selectedItemIds.length} items?`, async () => {
            const res = await bulkDeleteItems(selectedItemIds);
            if (res.success) {
                setSelectedItemIds([]);
                loadItems();
                showAlert('Items deleted', 'success');
            } else {
                showAlert(res.error || 'Failed to bulk delete items', 'error');
            }
        });
    }

    function openCreateModal() {
        setIsEditing(false);
        setEditId(null);
        setFormData({ sku: '', name: '', type: 'Raw', cost: 0, price: 0, minStock: 0, revision: '', warehouse: '', brand: '', isSerialized: false, description: '', icountId: undefined, inspectionTemplateUrl: null, inspectionTemplateName: null });
        setShowModal(true);
    }

    function openEditModal(item: any) {
        setIsEditing(true);
        setEditId(item.id);
        setFormData({
            sku: item.sku,
            name: item.name,
            type: item.type,
            cost: item.cost,
            price: item.price,
            minStock: item.minStock,
            revision: item.revision || '',
            warehouse: item.warehouse || '',
            brand: item.brand || '',
            isSerialized: item.isSerialized || false,
            description: item.description || '',
            icountId: item.icountId || undefined,
            inspectionTemplateUrl: item.inspectionTemplateUrl || null,
            inspectionTemplateName: item.inspectionTemplateName || null
        });
        setShowModal(true);
    }

    function resetForm() {
        setFormData({ sku: '', name: '', type: 'Raw', cost: 0, price: 0, minStock: 0, revision: '', warehouse: '', brand: '', isSerialized: false, description: '', icountId: undefined, inspectionTemplateUrl: null, inspectionTemplateName: null });
        setIsEditing(false);
        setEditId(null);
    }

    // -- Stock Editing --

    // -- Stock Adjustment Modal --
    const [showStockModal, setShowStockModal] = useState(false);
    const [stockModalData, setStockModalData] = useState<{ item: any, warehouseId: string, mode: 'set' | 'add' | 'remove', quantity: number, currentWhStock: number, location: string }>({
        item: null,
        warehouseId: '',
        mode: 'set',
        quantity: 0,
        currentWhStock: 0,
        location: ''
    });

    function openStockModal(item: any) {
        // Default to first warehouse if available, or empty
        const defaultWhId = warehouses.length > 0 ? String(warehouses[0].id) : '';
        const currentStock = getStockForWarehouse(item, defaultWhId);
        const currentLocation = getLocationForWarehouse(item, defaultWhId);

        setStockModalData({
            item,
            warehouseId: defaultWhId,
            mode: 'set',
            quantity: currentStock,
            currentWhStock: currentStock,
            location: currentLocation
        });
        setShowStockModal(true);
    }

    function getLocationForWarehouse(item: any, whId: string): string {
        if (!whId || !item.stocks) return '';
        const stock = item.stocks.find((s: any) => String(s.warehouseId) === String(whId));
        return stock?.location || '';
    }

    function getStockForWarehouse(item: any, whId: string) {
        if (!whId || !item.stocks) return 0;
        const stock = item.stocks.find((s: any) => String(s.warehouseId) === String(whId));
        return stock ? stock.quantity : 0;
    }

    // Effect to update current stock + location display when warehouse changes in modal
    useEffect(() => {
        if (showStockModal && stockModalData.item) {
            const current = getStockForWarehouse(stockModalData.item, stockModalData.warehouseId);
            const currentLocation = getLocationForWarehouse(stockModalData.item, stockModalData.warehouseId);
            setStockModalData(prev => ({ ...prev, currentWhStock: current, location: currentLocation }));
        }
    }, [stockModalData.warehouseId, showStockModal, stockModalData.item]);


    async function handleStockSave() {
        const { item, warehouseId, mode, quantity, currentWhStock, location } = stockModalData;
        if (!item) return;
        if (!warehouseId) {
            showAlert('Please select a warehouse', 'warning');
            return;
        }

        let newQuantity = quantity;
        if (mode === 'add') {
            newQuantity = currentWhStock + quantity;
        } else if (mode === 'remove') {
            newQuantity = currentWhStock - quantity;
        }

        if (newQuantity < 0) {
            showAlert('Stock cannot be negative', 'warning');
            return;
        }

        const res = await updateStock(item.id, newQuantity, parseInt(warehouseId), location);
        if (res.success) {
            setShowStockModal(false);
            loadItems();
            showAlert('Stock updated successfully', 'success');
        } else {
            showAlert(res.error || 'Failed to update stock', 'error');
        }
    }


    const [editingCostId, setEditingCostId] = useState<number | null>(null);
    const [costValue, setCostValue] = useState<string>('');

    // ...

    // -- Cost Editing Handlers -- //

    function startEditingCost(item: any) {
        setEditingCostId(item.id);
        setCostValue(String(item.cost || 0));
    }

    async function saveCost(id: number) {
        const newCost = parseFloat(costValue);
        if (isNaN(newCost) || newCost < 0) {
            setEditingCostId(null);
            return;
        }

        const res = await updateItemCost(id, newCost);
        if (res.success) {
            setItems(prev => prev.map(item => item.id === id ? { ...item, cost: newCost } : item));
            showAlert('Cost updated', 'success');
        } else {
            showAlert(res.error || 'Failed to update cost', 'error');
        }
        setEditingCostId(null);
    }


    // -- Import Handlers --

    const handleItemImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0]; // Assume first sheet
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws); // Read with headers

                if (data.length === 0) {
                    showAlert('No data found in file.', 'warning');
                    return;
                }

                // Map specific columns requested:
                // NAME, SKU, PART NUMBER, COST, PRICE, UNITS, TAX(18%), WAREHOUSE
                const mappedData = data.map((row: any) => {
                    const keys = Object.keys(row);
                    const getVal = (search: string, searchExact = false) => {
                        if (searchExact) {
                            return row[search];
                        }
                        // Case insensitive fuzzy match
                        const key = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === search.toLowerCase().replace(/[^a-z0-9]/g, ''));
                        return key ? row[key] : undefined;
                    };

                    // SKU logic: Check 'SKU', then 'PART NUMBER', then 'Part Number', etc.
                    const sku = getVal('sku') || getVal('part number') || getVal('partnumber');
                    const name = getVal('name') || getVal('item name');

                    return {
                        sku: String(sku || '').trim(),
                        name: String(name || '').trim(),
                        type: getVal('type') || getVal('category'), // Default mapping if exists
                        cost: Number(getVal('cost') || getVal('unit cost') || 0),
                        price: Number(getVal('price') || getVal('sales price') || 0),
                        // UNITS -> currentStock
                        currentStock: Number(getVal('units') || getVal('quantity') || getVal('qty') || 0),
                        minStock: Number(getVal('min stock') || getVal('reorder point') || 0),
                        revision: String(getVal('rev') || getVal('revision') || '').trim(),
                        warehouse: String(getVal('warehouse') || getVal('location') || '').trim(),
                        brand: String(getVal('brand') || getVal('manufacturer') || getVal('vendor') || '').trim()
                    };
                }).filter(i => i.sku && i.name); // Filter invalid items

                if (mappedData.length === 0) {
                    showAlert('No valid items found. Ensure valid "SKU" and "NAME" columns exist.', 'warning');
                    return;
                }

                showConfirm(`Found ${mappedData.length} items to import. Proceed?`, async () => {
                    const res = await importItems(mappedData as any);
                    if (res.success) {
                        showAlert(res.message || 'Import successful', 'success');
                        if (res.errors) showAlert('Some errors occurred: ' + res.errors.join('\n'), 'warning');
                        loadItems();

                        // POST-IMPORT: Ask to create Assembly
                        if (mappedData.length > 0) {
                            setRecentImportedItems(mappedData);
                            setAssemblyFormData({ name: '', sku: '' });
                            setShowAssemblyModal(true);
                        }
                    } else {
                        showAlert(res.error || 'Import failed', 'error');
                    }
                });

            } catch (err) {
                console.error(err);
                showAlert('Failed to parse Item Excel file.', 'error');
            } finally {
                if (itemInputRef.current) itemInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleBOMImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

                // Expecting Format: [ParentSKU, ChildSKU, Quantity]
                const bomRows: { parentSku: string; childSku: string; quantity: number }[] = [];
                for (let i = 0; i < data.length; i++) {
                    const row: any = data[i];
                    if (!row || row.length < 3) continue;

                    if (isNaN(row[2])) continue; // Header check

                    bomRows.push({
                        parentSku: String(row[0]),
                        childSku: String(row[1]),
                        quantity: Number(row[2])
                    });
                }

                if (bomRows.length === 0) {
                    showAlert('No valid BOM rows found. Ensure format: Parent SKU | Child SKU | Quantity', 'warning');
                    return;
                }

                showConfirm(`Found ${bomRows.length} BOM lines. Import?`, async () => {
                    const res = await importBOM(bomRows);
                    if (res.success) {
                        showAlert(res.message || 'BOM Import successful', 'success');
                        if (res.errors) showAlert('Errors: ' + res.errors.join('\n'), 'warning');
                    } else {
                        showAlert(res.error || 'BOM Import failed', 'error');
                    }
                });
            } catch (err) {
                console.error(err);
                showAlert('Failed to parse BOM Excel file.', 'error');
            } finally {
                if (bomInputRef.current) bomInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Selection State
    const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
    const [visibleCount, setVisibleCount] = useState<number>(20);

    // Derived State
    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()));

        let matchesWarehouse = true;
        if (selectedWarehouse) {
            // Check legacy string OR new relation
            // Look up warehouse name from ID
            const selectedWhName = warehouses.find(w => String(w.id) === selectedWarehouse)?.name;
            const matchesLegacy = item.warehouse === selectedWarehouse || (selectedWhName && item.warehouse === selectedWhName);

            // Check stock relation
            // Note: selectedWarehouse is ID string from select
            const whId = parseInt(selectedWarehouse);
            const matchesRelation = !isNaN(whId) && item.stocks?.some((s: any) => s.warehouseId === whId && s.quantity > 0);

            matchesWarehouse = matchesLegacy || matchesRelation;
        }

        const matchesType = !filterType || item.type === filterType;
        const matchesBrand = !filterBrand || item.brand === filterBrand;
        const matchesLowStock = !filterLowStock || (Number(item.currentStock) < Number(item.minStock));

        return matchesSearch && matchesWarehouse && matchesType && matchesBrand && matchesLowStock;
    }).sort((a, b) => {
        if (!sortConfig) return 0;
        const { key, direction } = sortConfig;

        let aVal = a[key] ?? '';
        let bVal = b[key] ?? '';

        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    const displayedItems = filteredItems.slice(0, visibleCount);

    useEffect(() => {
        setVisibleCount(20);
    }, [searchTerm, selectedWarehouse, filterType, filterBrand, filterLowStock, sortConfig]);

    async function handleCreateAssembly() {
        if (!assemblyFormData.sku || !assemblyFormData.name) {
            showAlert('Please provide Name and SKU for the new Product.', 'warning');
            return;
        }

        const componentSkus = recentImportedItems.map(i => i.sku);
        const res = await createAssemblyFromItems(assemblyFormData, componentSkus);

        if (res.success) {
            setShowAssemblyModal(false);
            setRecentImportedItems([]);
            loadItems();

            // Open Sell Modal with this new item
            setSellFormData({
                sku: assemblyFormData.sku,
                customer: '',
                price: 0,
                quantity: 1
            });
            setShowSellModal(true);
            showAlert('Assembly created', 'success');
        } else {
            showAlert('Failed: ' + res.error, 'error');
        }
    }

    async function handleCreateSale() {
        const res = await createSaleFromInventory(sellFormData);
        if (res.success) {
            showAlert(res.message || 'Sale created', 'success');
            setShowSellModal(false);
        } else {
            showAlert(res.error || 'Sale creation failed', 'error');
        }
    }

    function openBulkStockModal() {
        if (selectedItemIds.length === 0) {
            showAlert('Select items first', 'warning');
            return;
        }
        // Initialize quantities with current stock
        const initialQtys: { [id: number]: number } = {};
        selectedItemIds.forEach(id => {
            const item = items.find(i => i.id === id);
            if (item) initialQtys[id] = item.currentStock || 0;
        });
        setBulkStockQuantities(initialQtys);
        setBulkStockWarehouse(warehouses.length > 0 ? String(warehouses[0].id) : '');
        setShowBulkStockModal(true);
    }

    async function handleBulkStockUpdate() {
        if (!bulkStockWarehouse) {
            showAlert('Select a warehouse', 'warning');
            return;
        }

        const updates = selectedItemIds.map(id => ({
            itemId: id,
            quantity: bulkStockQuantities[id] || 0,
            warehouseId: parseInt(bulkStockWarehouse)
        }));

        showConfirm(`Update stock for ${updates.length} items in selected warehouse?`, async () => {
            const res = await bulkUpdateStock(updates);
            if (res.success) {
                showAlert('Stock updated successfully', 'success');
                setShowBulkStockModal(false);
                setSelectedItemIds([]);
                loadItems();
            } else {
                showAlert(res.error || 'Failed to update stock', 'error');
            }
        });
    }

    function handleExportToExcel() {
        // Prepare data for export
        const exportData = filteredItems.map(item => {
            const warehouseStocks = item.stocks?.map((s: any) => {
                const wh = warehouses.find(w => w.id === s.warehouseId);
                return `${wh?.name || 'Unknown'}: ${s.quantity}`;
            }).join(', ') || '';

            return {
                'SKU': item.sku,
                'Revision': item.revision || '',
                'Name': item.name,
                'Brand': item.brand || '',
                'Type': item.type,
                'Warehouse': item.warehouse || '',
                'Total Physical': item.currentStock || 0,
                'Warehouse Breakdown': warehouseStocks,
                'Allocated': item.allocatedStock || 0,
                'Available': Math.max(0, (item.currentStock || 0) - (item.allocatedStock || 0)),
                'Min Stock': item.minStock || 0,
                'Cost': item.cost || 0,
                'Price': item.price || 0,
                'Description': item.description || ''
            };
        });

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 }, // SKU
            { wch: 8 },  // Revision
            { wch: 30 }, // Name
            { wch: 15 }, // Brand
            { wch: 10 }, // Type
            { wch: 15 }, // Warehouse
            { wch: 12 }, // Total Stock
            { wch: 30 }, // Warehouse Breakdown
            { wch: 10 }, // Min Stock
            { wch: 10 }, // Cost
            { wch: 10 }, // Price
            { wch: 40 }  // Description
        ];

        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `Inventory_Export_${timestamp}.xlsx`;

        // Download
        XLSX.writeFile(wb, filename);
        showAlert(`Exported ${exportData.length} items to ${filename}`, 'success');
    }

    return (
        <>
            <div className="animate-fade-in">
                <div className="flex-header">
                    <div>
                        <h1>Inventory Management</h1>
                        <p>Track items, BOMs, and stock levels.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>

                        {/* Export Button */}
                        <button className="btn btn-outline" onClick={handleExportToExcel} disabled={filteredItems.length === 0}>
                            <FileSpreadsheet size={18} />
                            Export to Excel
                        </button>

                        {/* Items Import */}
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            style={{ display: 'none' }}
                            ref={itemInputRef}
                            onChange={handleItemImport}
                        />
                        <button className="btn btn-outline" onClick={() => itemInputRef.current?.click()}>
                            <Upload size={18} />
                            Import Items
                        </button>

                        {/* BOM Import */}
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            style={{ display: 'none' }}
                            ref={bomInputRef}
                            onChange={handleBOMImport}
                        />
                        <button className="btn btn-outline" onClick={() => bomInputRef.current?.click()}>
                            <Upload size={18} />
                            Import BOM
                        </button>

                        <button className="btn btn-primary" onClick={openCreateModal}>
                            <Plus size={18} />
                            New Item
                        </button>
                    </div>
                </div>

                <div className="card full-width-page" style={{ marginBottom: '2rem', paddingLeft: 0, paddingRight: 0, borderLeft: 'none', borderRight: 'none', borderRadius: 0 }}>

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0 1.5rem' }}>
                        {/* Barcode Scanner */}
                        <div style={{ position: 'relative', width: '220px' }}>
                            <Barcode size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                            <input
                                type="text"
                                placeholder="Scan Barcode..."
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const scannedSku = e.currentTarget.value.trim();
                                        if (!scannedSku) return;
                                        const item = items.find(i => i.sku.toLowerCase() === scannedSku.toLowerCase());
                                        e.currentTarget.value = ''; // clear
                                        if (item) {
                                            openStockModal(item);
                                        } else {
                                            showAlert(`SKU not found: ${scannedSku}`, 'error');
                                        }
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem 0.75rem 3rem',
                                    background: 'var(--bg-dark)',
                                    border: '1px solid var(--primary)',
                                    borderRadius: 'var(--radius-md)',
                                    color: 'white',
                                    fontSize: '0.95rem',
                                    boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.2)'
                                }}
                            />
                        </div>

                        {/* Text Search */}
                        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input
                                type="text"
                                placeholder="Search by SKU or Name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem 0.75rem 3rem',
                                    background: 'var(--bg-dark)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: 'var(--radius-md)',
                                    color: 'var(--text-main)',
                                    fontSize: '0.95rem'
                                }}
                            />
                        </div>

                        <select
                            value={selectedWarehouse}
                            onChange={e => setSelectedWarehouse(e.target.value)}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'var(--bg-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-main)',
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                minWidth: '150px'
                            }}
                        >
                            <option value="">All Warehouses</option>
                            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>

                        <select
                            value={filterType}
                            onChange={e => setFilterType(e.target.value)}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'var(--bg-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-main)',
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                minWidth: '130px'
                            }}
                        >
                            <option value="">All Types</option>
                            <option value="Raw">Raw</option>
                            <option value="Assembly">Assembly</option>
                            <option value="Product">Product</option>
                        </select>

                        <select
                            value={filterBrand}
                            onChange={e => setFilterBrand(e.target.value)}
                            style={{
                                padding: '0.75rem 1rem',
                                background: 'var(--bg-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--text-main)',
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                minWidth: '130px'
                            }}
                        >
                            <option value="">All Brands</option>
                            {Array.from(new Set(items.map(i => i.brand).filter(Boolean))).sort().map((brand: any) => (
                                <option key={brand} value={brand}>{brand}</option>
                            ))}
                        </select>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            padding: '0.75rem 1rem',
                            background: filterLowStock ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-dark)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.95rem',
                            whiteSpace: 'nowrap'
                        }}>
                            <input
                                type="checkbox"
                                checked={filterLowStock}
                                onChange={e => setFilterLowStock(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            Low Stock Only
                        </label>

                        {selectedItemIds.length > 0 && (
                            <div className="animate-in fade-in slide-in-from-right-4" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{selectedItemIds.length} selected</span>
                                <button
                                    onClick={openBulkStockModal}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        fontSize: '0.875rem'
                                    }}
                                >
                                    <Package size={16} />
                                    Adjust Stock
                                    Adjust Stock
                                </button>
                                {isAdmin && (
                                    <button
                                        onClick={handleBulkDelete}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            background: '#ef4444',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 'var(--radius-md)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.875rem'
                                        }}
                                    >
                                        <span style={{ fontSize: '1.25em' }}>×</span> Delete Selected
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading inventory...</div>
                    ) : (
                        <div className="table-responsive mobile-card-view">
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                        <th style={{ padding: '1rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id))}
                                                onChange={() => {
                                                    if (filteredItems.every(i => selectedItemIds.includes(i.id))) {
                                                        setSelectedItemIds([]);
                                                    } else {
                                                        setSelectedItemIds(filteredItems.map(i => i.id));
                                                    }
                                                }}
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                        </th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('sku')}>SKU {sortConfig?.key === 'sku' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('revision')}>Rev {sortConfig?.key === 'revision' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('name')}>Name {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('brand')}>Brand {sortConfig?.key === 'brand' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('type')}>Type {sortConfig?.key === 'type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('warehouse')}>Warehouse {sortConfig?.key === 'warehouse' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('currentStock')}>Available {sortConfig?.key === 'currentStock' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem', cursor: 'pointer' }} onClick={() => handleSort('cost')}>Cost {sortConfig?.key === 'cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                        <th style={{ padding: '1rem' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No items found. Import BOM or create a new item.
                                            </td>
                                        </tr>
                                    ) : (
                                        displayedItems.map((item, index) => {
                                            const isNearBottom = filteredItems.length > 3 && index >= filteredItems.length - 2;
                                            const isExpanded = expandedRows.includes(item.id);
                                            return (
                                                <tr key={item.id} className={`expandable-row ${isExpanded ? 'expanded' : ''}`} onClick={() => toggleRow(item.id)} style={{ borderBottom: '1px solid var(--border-color)', background: selectedItemIds.includes(item.id) ? 'rgba(16, 185, 129, 0.05)' : undefined, cursor: 'pointer' }}>
                                                    <td style={{ padding: '1rem' }} data-label="Select" onClick={e => e.stopPropagation()}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedItemIds.includes(item.id)}
                                                            onChange={() => {
                                                                if (selectedItemIds.includes(item.id)) {
                                                                    setSelectedItemIds(prev => prev.filter(id => id !== item.id));
                                                                } else {
                                                                    setSelectedItemIds(prev => [...prev, item.id]);
                                                                }
                                                            }}
                                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '1rem', fontWeight: 500 }} data-label="SKU">{item.sku}</td>
                                                    <td style={{ padding: '1rem' }} data-label="Revision">{item.revision}</td>
                                                    <td style={{ padding: '1rem' }} data-label="Name">{item.name}</td>
                                                    <td style={{ padding: '1rem' }} data-label="Brand">{item.brand}</td>
                                                    <td style={{ padding: '1rem' }} data-label="Type">
                                                        <span className={`badge ${item.type === 'Product' ? 'badge-success' : item.type === 'Assembly' ? 'badge-warning' : 'badge-danger'}`} style={{ color: item.type === 'Raw' ? 'var(--text-muted)' : undefined, border: item.type === 'Raw' ? '1px solid var(--border-color)' : undefined, background: item.type === 'Raw' ? 'transparent' : undefined }}>
                                                            {item.type}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '1rem' }} data-label="Warehouse">
                                                        <div style={{ fontWeight: 500, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                                            {item.stocks && item.stocks.length > 0 && warehouses.length > 0 ? (
                                                                item.stocks.map((s: any) => {
                                                                    const wh = warehouses.find((w: any) => w.id === s.warehouseId);
                                                                    if (!wh) return null;
                                                                    return (
                                                                        <div key={s.warehouseId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                            <span>{wh.name}</span>
                                                                            {s.location && (
                                                                                <span style={{ 
                                                                                    padding: '0.1rem 0.5rem', 
                                                                                    background: 'rgba(16,185,129,0.1)', 
                                                                                    color: '#10b981', 
                                                                                    borderRadius: '999px', 
                                                                                    fontSize: '0.75rem', 
                                                                                    fontWeight: 500,
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.2rem'
                                                                                }}>
                                                                                    <MapPin size={10} /> {s.location}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <span style={{ opacity: 0.5, fontStyle: 'italic' }}>{item.warehouse || 'Unassigned'}</span>
                                                            )}
                                                        </div>
                                                        {item.stocks && item.stocks.length > 0 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setViewStockItem(item); }}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    padding: 0,
                                                                    marginTop: '0.4rem',
                                                                    color: 'var(--primary)',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.25rem',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 500
                                                                }}
                                                            >
                                                                View Qty by Location
                                                            </button>
                                                        )}
                                                    </td>

                                                    {/* Stock Cell with Modal Trigger */}
                                                    <td style={{ padding: '1rem' }} className="group" data-label="Stock">
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                {selectedWarehouse && !isNaN(parseInt(selectedWarehouse)) ? (
                                                                    // Show filtered warehouse stock
                                                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                                                        {item.stocks?.find((s: any) => s.warehouseId === parseInt(selectedWarehouse))?.quantity || 0}
                                                                    </span>
                                                                ) : (
                                                                    // Show Available & Allocated
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span style={{ fontSize: '1rem', fontWeight: 600 }} title="Available Stock (Total Physical - Allocated)">
                                                                            {Math.max(0, (item.currentStock ?? 0) - (item.allocatedStock ?? 0))}
                                                                        </span>
                                                                        {(item.allocatedStock ?? 0) > 0 && (
                                                                            <span style={{ fontSize: '0.75rem', color: '#f59e0b' }} title="Allocated to Confirmed Sales Orders">
                                                                                Alloc: {item.allocatedStock}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                <button
                                                                    onClick={() => openStockModal(item)}
                                                                    style={{ opacity: 0.3, transition: 'opacity 0.2s', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-main)' }}
                                                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
                                                                    title="Adjust Stock"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td style={{ padding: '1rem' }} className="group" data-label="Cost">
                                                        {editingCostId === item.id ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span style={{ color: 'var(--text-muted)' }}>$</span>
                                                                <input
                                                                    type="number"
                                                                    value={costValue}
                                                                    onChange={e => setCostValue(e.target.value)}
                                                                    autoFocus
                                                                    style={{ width: '80px', padding: '0.25rem', background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '4px', color: 'white' }}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') saveCost(item.id);
                                                                        if (e.key === 'Escape') setEditingCostId(null);
                                                                    }}
                                                                    onBlur={() => saveCost(item.id)}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <span>${item.cost?.toFixed(2) ?? '0.00'}</span>
                                                                <button
                                                                    onClick={() => startEditingCost(item)}
                                                                    style={{ opacity: 0.3, transition: 'opacity 0.2s', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-main)' }}
                                                                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                                    onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '1rem', overflow: 'visible' }} data-label="Actions" onClick={e => e.stopPropagation()}>
                                                        <div className="actions-menu-container" style={{ position: 'relative', zIndex: activeActionId === item.id ? 999 : 'auto' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <button
                                                                    className="mobile-expand-btn btn btn-sm btn-outline"
                                                                    style={{ display: 'none' }}
                                                                    onClick={(e) => { e.stopPropagation(); toggleRow(item.id); }}
                                                                >
                                                                    {isExpanded ? 'Show Less' : 'Show More'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.25rem' }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setActiveActionId(activeActionId === item.id ? null : item.id);
                                                                    }}
                                                                >
                                                                    <MoreHorizontal size={20} style={{ pointerEvents: 'none' }} />
                                                                </button>
                                                                {activeActionId === item.id && (
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        right: 0,
                                                                        top: isNearBottom ? 'auto' : '100%',
                                                                        bottom: isNearBottom ? '100%' : 'auto',
                                                                        marginBottom: isNearBottom ? '0.25rem' : 0,
                                                                        marginTop: isNearBottom ? 0 : '0.25rem',
                                                                        background: 'var(--bg-card)',
                                                                        border: '1px solid var(--border-color)',
                                                                        borderRadius: 'var(--radius-md)',
                                                                        zIndex: 1000,
                                                                        minWidth: '160px',
                                                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3)'
                                                                    }} className="animate-in fade-in zoom-in-95 duration-100">
                                                                        <button
                                                                            type="button"
                                                                            style={{ display: 'block', width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.875rem' }}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openEditModal(item);
                                                                                setActiveActionId(null);
                                                                            }}
                                                                        >
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <Edit2 size={14} /> Edit Item
                                                                            </div>
                                                                        </button>

                                                                        {isAdmin && (
                                                                            <button
                                                                                style={{ display: 'block', width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: 'none', borderTop: '1px solid var(--border-color)', color: '#ef4444', cursor: 'pointer', fontSize: '0.875rem' }}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteItem(item.id, item.sku);
                                                                                    setActiveActionId(null);
                                                                                }}
                                                                            >
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <X size={14} /> Delete
                                                                            </div>
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        style={{ display: 'block', width: '100%', padding: '0.75rem 1rem', textAlign: 'left', background: 'none', borderTop: '1px solid var(--border-color)', color: 'var(--text-main)', cursor: 'pointer', fontSize: '0.875rem' }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openHistory(item);
                                                                            setActiveActionId(null);
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                            <History size={14} /> Item History
                                                                        </div>
                                                                    </button>

                                                                </div>

                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                            {filteredItems.length > visibleCount && (
                                <div style={{ textAlign: 'center', marginTop: '1rem', padding: '1rem' }}>
                                    <button
                                        onClick={() => setVisibleCount(prev => prev + 20)}
                                        className="btn btn-outline"
                                        style={{ width: '100%', maxWidth: '300px' }}
                                    >
                                        Load More ({filteredItems.length - visibleCount} remaining)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div >

            {/* Floating Action Buttons for Mobile */}
            <div className="fab-container">
                <button
                    className="fab-button"
                    onClick={() => openCreateModal()}
                    aria-label="Add Item"
                    title="Add Inventory Item"
                >
                    <Plus size={24} />
                </button>
                <div style={{ height: '0.5rem' }}></div>
                {/* Secondary FAB (Small) - Optional logic to expand */}
                <button
                    className="fab-button"
                    style={{ width: '48px', height: '48px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    onClick={() => setShowAssemblyModal(true)}
                    aria-label="New Assembly"
                    title="Create Assembly"
                >
                    <Package size={20} />
                </button>
            </div>

            {/* Create/Edit Item Modal */}
            {
                showModal && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050
                    }}>
                        <div className="card" style={{ width: '500px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                <h3>{isEditing ? 'Edit Item' : 'Create New Item'}</h3>
                                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleSubmitItem}>
                                <div className="grid-responsive-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>SKU</label>
                                        <div className="barcode-input-wrapper">
                                            <input
                                                type="text"
                                                value={formData.sku}
                                                onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                                className="input-group"
                                                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                                required
                                            />
                                            <button
                                                type="button"
                                                title="Scan Barcode"
                                                onClick={() => {
                                                    const code = prompt("Simulate Scan:");
                                                    if (code) setFormData(prev => ({ ...prev, sku: code }));
                                                }}
                                                className="camera-icon"
                                                style={{ pointerEvents: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"></path><path d="M17 3h2a2 2 0 0 1 2 2v2"></path><path d="M21 17v2a2 2 0 0 1-2 2h-2"></path><path d="M7 21H5a2 2 0 0 1-2-2v-2"></path><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Revision</label>
                                        <input
                                            type="text"
                                            value={formData.revision}
                                            onChange={e => setFormData({ ...formData, revision: e.target.value })}
                                            className="input-group"
                                            placeholder="e.g. A2"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Type</label>
                                        <select
                                            value={formData.type}
                                            onChange={e => setFormData({ ...formData, type: e.target.value })}
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        >
                                            <option value="Raw">Raw Material</option>
                                            <option value="Assembly">Assembly</option>
                                            <option value="Product">Final Product</option>
                                        </select>
                                    </div>

                                </div>

                                <div className="grid-responsive-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Warehouse / Location</label>
                                        <input
                                            type="text"
                                            value={formData.warehouse}
                                            onChange={e => setFormData({ ...formData, warehouse: e.target.value })}
                                            className="input-group"
                                            placeholder="e.g. A-12"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500 }}>
                                            <input
                                                type="checkbox"
                                                checked={formData.isSerialized}
                                                onChange={e => setFormData({ ...formData, isSerialized: e.target.checked })}
                                                style={{ width: '16px', height: '16px' }}
                                            />
                                            Is Serialized Item?
                                        </label>
                                    </div>
                                </div>


                                <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="input-group"
                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        required
                                    />
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="input-group"
                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white', minHeight: '80px', fontFamily: 'inherit' }}
                                    />
                                </div>

                                <div className="grid-responsive-2" style={{ gap: '1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Brand</label>
                                        <input
                                            type="text"
                                            value={formData.brand}
                                            onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>iCount ID</label>
                                        <input
                                            type="number"
                                            value={formData.icountId || ''}
                                            onChange={e => setFormData({ ...formData, icountId: parseInt(e.target.value) || undefined })}
                                            className="input-group"
                                            placeholder="External ID"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                </div>

                                <div className="grid-cols-3" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Cost</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.cost}
                                            onChange={e => setFormData({ ...formData, cost: parseFloat(e.target.value) })}
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Price</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Min Stock</label>
                                        <input
                                            type="number"
                                            value={formData.minStock}
                                            onChange={e => setFormData({ ...formData, minStock: parseInt(e.target.value) })}
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.5rem', marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-dark)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <FileSpreadsheet size={16} /> Inspection Report Template
                                    </h4>
                                    
                                    {formData.inspectionTemplateName ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <Check size={16} style={{ color: 'var(--success)' }} />
                                                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{formData.inspectionTemplateName}</span>
                                            </div>
                                            {(isAdmin || user?.role === 'Warehouse') && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => setFormData({ ...formData, inspectionTemplateName: null, inspectionTemplateUrl: null })}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            {(isAdmin || user?.role === 'Warehouse') ? (
                                                <div 
                                                    onClick={() => {
                                                        const url = prompt("Enter Template URL (e.g. from a cloud storage) or use a placeholder:");
                                                        if (url) {
                                                            setFormData({ ...formData, inspectionTemplateUrl: url, inspectionTemplateName: "Inspection_Template.xlsx" });
                                                        }
                                                    }}
                                                    style={{ border: '2px dashed var(--border-color)', padding: '1.5rem', textAlign: 'center', borderRadius: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)', transition: 'background 0.2s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <Upload size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                                                    <div style={{ fontSize: '0.85rem' }}>Click to set Template URL</div>
                                                    <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', opacity: 0.6 }}>Only Admins and Warehouse Managers</div>
                                                </div>
                                            ) : (
                                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                                    No template uploaded.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">{isEditing ? 'Save Changes' : 'Create Item'}</button>
                                </div>
                            </form>
                        </div >
                    </div >
                )
            }

            {/* Assembly Creation Modal */}
            {
                showAssemblyModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{ maxWidth: '600px' }}>
                            <h2 style={{ marginBottom: '1rem' }}>Create Assembly from Import</h2>
                            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
                                You imported {recentImportedItems.length} items. Would you like to assemble them into a Product?
                            </p>

                            <div className="form-group">
                                <label>Product Name</label>
                                <input
                                    type="text"
                                    className="input-group"
                                    value={assemblyFormData.name}
                                    onChange={e => setAssemblyFormData({ ...assemblyFormData, name: e.target.value })}
                                    placeholder="e.g. New Device Bundle"
                                />
                            </div>

                            <div className="form-group" style={{ marginTop: '1rem' }}>
                                <label>Product SKU</label>
                                <input
                                    type="text"
                                    className="input-group"
                                    value={assemblyFormData.sku}
                                    onChange={e => setAssemblyFormData({ ...assemblyFormData, sku: e.target.value })}
                                    placeholder="e.g. PROD-001"
                                />
                            </div>

                            <div style={{ marginTop: '1.5rem', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-dark)', padding: '1rem', borderRadius: '0.5rem' }}>
                                <h4 style={{ marginBottom: '0.5rem' }}>Components:</h4>
                                <ul style={{ paddingLeft: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    {recentImportedItems.map((item, idx) => (
                                        <li key={idx}>{item.sku} - {item.name}</li>
                                    ))}
                                </ul>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                                <button className="btn btn-outline" onClick={() => { setShowAssemblyModal(false); setRecentImportedItems([]); }}>Skip</button>
                                <button className="btn btn-primary" onClick={handleCreateAssembly}>Create Product & BOM</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Sell Modal */}
            {
                showSellModal && (
                    <div className="modal-overlay">
                        <div className="modal-content" style={{ maxWidth: '500px' }}>
                            <h2 style={{ marginBottom: '1rem' }}>Sell Item</h2>
                            <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg-dark)', borderRadius: '0.5rem' }}>
                                <strong>Item:</strong> {sellFormData.sku}
                            </div>

                            <div className="form-group">
                                <label>Customer Name</label>
                                <input
                                    type="text"
                                    className="input-group"
                                    value={sellFormData.customer}
                                    onChange={e => setSellFormData({ ...sellFormData, customer: e.target.value })}
                                    placeholder="e.g. John Doe"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="form-group">
                                    <label>Quantity</label>
                                    <input
                                        type="number"
                                        className="input-group"
                                        value={sellFormData.quantity}
                                        onChange={e => setSellFormData({ ...sellFormData, quantity: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Unit Price</label>
                                    <input
                                        type="number"
                                        className="input-group"
                                        value={sellFormData.price}
                                        onChange={e => setSellFormData({ ...sellFormData, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                                <button className="btn btn-outline" onClick={() => setShowSellModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleCreateSale}>Confirm Sale</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Stock Details Modal */}
            {
                viewStockItem && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60
                    }} onClick={() => setViewStockItem(null)}>
                        <div className="card" style={{ width: '400px', maxWidth: '90%' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                <div>
                                    <h3 style={{ marginBottom: '0.25rem' }}>Stock Locations</h3>
                                    <div style={{ color: 'var(--text-muted)' }}>{viewStockItem.sku} - {viewStockItem.name}</div>
                                </div>
                                <button onClick={() => setViewStockItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                <div className="table-responsive">
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                                                <th style={{ padding: '0.75rem' }}>Warehouse</th>
                                                <th style={{ padding: '0.75rem' }}>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                        <MapPin size={12} /> Location
                                                    </span>
                                                </th>
                                                <th style={{ padding: '0.75rem', textAlign: 'right' }}>Quantity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {viewStockItem.stocks?.sort((a: any, b: any) => b.quantity - a.quantity).map((s: any) => (
                                                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                                                        {s.warehouse.name}
                                                    </td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        {s.location ? (
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 500 }}>
                                                                <MapPin size={10} />{s.location}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: s.quantity < 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                                                        {s.quantity}
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr style={{ borderTop: '2px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '0.75rem', fontWeight: 600 }} colSpan={2}>Total</td>
                                                <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                                                    {viewStockItem.stocks?.reduce((acc: number, s: any) => acc + s.quantity, 0)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-outline" onClick={() => setViewStockItem(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Stock Adjustment Modal */}
            {
                showStockModal && stockModalData.item && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1050
                    }}>
                        <div className="card" style={{ width: '500px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ marginBottom: '0.25rem' }}>Adjust Stock</h3>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        {stockModalData.item.sku} - {stockModalData.item.name}
                                    </div>
                                </div>
                                <button onClick={() => setShowStockModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            {/* 1. Warehouse Selection */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Warehouse</label>
                                <select
                                    className="input-group"
                                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white' }}
                                    value={stockModalData.warehouseId}
                                    onChange={e => setStockModalData(prev => ({ ...prev, warehouseId: e.target.value }))}
                                >
                                    <option value="" disabled>Select Warehouse...</option>
                                    {warehouses.map(w => (
                                        <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                                    ))}
                                </select>
                            </div>

                            {stockModalData.warehouseId ? (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    {/* Current Status */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', background: 'var(--bg-dark)', padding: '1rem', borderRadius: '0.5rem' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Current Stock:</span>
                                        <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{stockModalData.currentWhStock}</span>
                                    </div>

                                    {/* 2. Action Mode */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                        <button
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', background: stockModalData.mode === 'add' ? '#10b981' : 'var(--bg-dark)', color: stockModalData.mode === 'add' ? 'white' : 'var(--text-muted)' }}
                                            onClick={() => setStockModalData(prev => ({ ...prev, mode: 'add', quantity: 0 }))}
                                        >
                                            <Plus size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.25rem' }} /> Add
                                        </button>
                                        <button
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', background: stockModalData.mode === 'remove' ? '#ef4444' : 'var(--bg-dark)', color: stockModalData.mode === 'remove' ? 'white' : 'var(--text-muted)' }}
                                            onClick={() => setStockModalData(prev => ({ ...prev, mode: 'remove', quantity: 0 }))}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                                <span style={{ fontSize: '1.2rem', lineHeight: '1rem' }}>-</span> Remove
                                            </div>
                                        </button>
                                        <button
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', background: stockModalData.mode === 'set' ? 'var(--primary)' : 'var(--bg-dark)', color: stockModalData.mode === 'set' ? 'white' : 'var(--text-muted)' }}
                                            onClick={() => setStockModalData(prev => ({ ...prev, mode: 'set', quantity: stockModalData.currentWhStock }))}
                                        >
                                            <Edit2 size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.25rem' }} /> Set
                                        </button>
                                    </div>

                                    {/* 3. Quantity + Location Input */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                            {stockModalData.mode === 'set' ? 'New Total Quantity' : 'Quantity to ' + (stockModalData.mode === 'add' ? 'Add' : 'Remove')}
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <input
                                                type="number"
                                                className="input-group"
                                                style={{ width: '100%', padding: '0.75rem', fontSize: '1.2rem', background: 'var(--bg-dark)', border: '1px solid var(--primary)', borderRadius: '0.375rem', color: 'white' }}
                                                value={stockModalData.quantity}
                                                onChange={e => setStockModalData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                                                autoFocus
                                                min="0"
                                                step="0.01"
                                            />
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                                Resulting Stock: <strong style={{ color: 'var(--primary)' }}>
                                                    {stockModalData.mode === 'set' ? stockModalData.quantity :
                                                        stockModalData.mode === 'add' ? stockModalData.currentWhStock + stockModalData.quantity :
                                                            stockModalData.currentWhStock - stockModalData.quantity}
                                                </strong>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 4. Location Input */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                                            <MapPin size={13} style={{ color: '#10b981' }} /> Bin / Shelf Location <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.65rem 0.75rem', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', color: 'white', fontSize: '0.95rem' }}
                                            placeholder="e.g. Shelf A3, Bin B-12, Row 4"
                                            value={stockModalData.location}
                                            onChange={e => setStockModalData(prev => ({ ...prev, location: e.target.value }))}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                        <button className="btn btn-outline" onClick={() => setShowStockModal(false)}>Cancel</button>
                                        <button className="btn btn-primary" onClick={handleStockSave}>Update Stock</button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-dark)', borderRadius: '0.5rem' }}>
                                    Please select a warehouse to manage stock.
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Bulk Stock Adjustment Modal */}
            {
                showBulkStockModal && (
                    <div className="modal-overlay" onClick={() => setShowBulkStockModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2>Bulk Stock Adjustment</h2>
                                <button onClick={() => setShowBulkStockModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Warehouse</label>
                                <select
                                    value={bulkStockWarehouse}
                                    onChange={e => setBulkStockWarehouse(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: 'var(--bg-dark)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--text-main)'
                                    }}
                                >
                                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 500 }}>
                                    Adjust quantities for {selectedItemIds.length} items:
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflow: 'auto', padding: '0.5rem' }}>
                                    {selectedItemIds.map(id => {
                                        const item = items.find(i => i.id === id);
                                        if (!item) return null;
                                        return (
                                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 500 }}>{item.sku}</div>
                                                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{item.name}</div>
                                                </div>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={bulkStockQuantities[id] || 0}
                                                    onChange={e => setBulkStockQuantities({ ...bulkStockQuantities, [id]: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '100px',
                                                        padding: '0.5rem',
                                                        background: 'var(--bg-main)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--text-main)',
                                                        textAlign: 'center'
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button className="btn btn-outline" onClick={() => setShowBulkStockModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleBulkStockUpdate}>Update Stock</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* History Modal */}
            {
                showHistoryModal && historyItem && (
                    <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <h2 style={{ marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <History size={20} style={{ color: 'var(--primary)' }} />
                                        Item History
                                    </h2>
                                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                                        Audit log for {historyItem.sku}
                                    </p>
                                </div>
                                <button onClick={() => setShowHistoryModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                                {loadingHistory ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Loading history...</div>
                                ) : historyData.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                                        No history found for this item.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {historyData.map((log: any) => {
                                            const actionColor = log.action.includes('DELETE') ? 'var(--danger)' :
                                                                log.action.includes('CREATE') ? 'var(--primary)' :
                                                                'var(--warning)';
                                            
                                            return (
                                                <div key={log.id} style={{ 
                                                    padding: '1rem', 
                                                    background: 'var(--bg-dark)', 
                                                    border: '1px solid var(--border-color)', 
                                                    borderRadius: 'var(--radius-md)',
                                                    borderLeft: `4px solid ${actionColor}`
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                        <strong style={{ fontSize: '0.95rem' }}>{log.action.replace(/_/g, ' ')}</strong>
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                            {new Date(log.createdAt).toLocaleString()}
                                                        </span>
                                                    </div>
                                                    
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 600, fontSize: '0.7rem' }}>
                                                            {log.user?.name?.[0]?.toUpperCase() || '?'}
                                                        </div>
                                                        {log.user?.name}
                                                    </div>

                                                    {log.details && (
                                                        <div style={{ 
                                                            fontSize: '0.85rem', 
                                                            background: 'rgba(0,0,0,0.2)', 
                                                            padding: '0.75rem', 
                                                            borderRadius: '4px',
                                                            fontFamily: 'monospace',
                                                            whiteSpace: 'pre-wrap',
                                                            wordBreak: 'break-all',
                                                            color: 'var(--text-main)',
                                                            overflowX: 'auto'
                                                        }}>
                                                            {(() => {
                                                                try {
                                                                    const parsed = JSON.parse(log.details);
                                                                    return JSON.stringify(parsed, null, 2);
                                                                } catch {
                                                                    return log.details;
                                                                }
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
