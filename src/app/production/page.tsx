'use client'
import React, { useState, useEffect, useRef } from 'react';
import { PackageCheck, ScanLine, History, Settings, Play, Plus, Trash2, Save, Edit2 } from 'lucide-react';
import { getAssemblyParents, getComponentOptions, getBOM, saveBOM, runProduction, getProductionRuns, updateProductionRun, deleteProductionRun, bulkDeleteProductionRuns } from './actions';
import { createItem, deleteItem, updateItemCost } from '../inventory/actions';
import { useSystem } from '@/components/SystemProvider';


export default function ProductionPage() {
    const { user, showAlert, showConfirm } = useSystem();
    const isAdmin = user?.role === 'Admin';
    const [activeTab, setActiveTab] = useState<'define' | 'run'>('define');

    // Data Lists
    const [parents, setParents] = useState<any[]>([]);
    const [components, setComponents] = useState<any[]>([]);

    // --- Define Assembly State ---
    const [selectedParentId, setSelectedParentId] = useState<string>('');
    const [bomLines, setBomLines] = useState<{ childId: string, quantity: number }[]>([]);
    const [isLoadingBOM, setIsLoadingBOM] = useState(false);

    // Cost & Price State
    const [parentCost, setParentCost] = useState<number>(0);
    const [parentPrice, setParentPrice] = useState<number>(0);
    const [calculatedCost, setCalculatedCost] = useState<number>(0);

    // --- Run Production State ---
    const [runParentId, setRunParentId] = useState<string>('');
    const [runQuantity, setRunQuantity] = useState<number>(1);
    const [serialNumbers, setSerialNumbers] = useState<string>(''); // Comma separated
    const [runStatus, setRunStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [runMessage, setRunMessage] = useState('');
    const [productionRuns, setProductionRuns] = useState<any[]>([]);

    // --- Edit Run State ---
    const [editingRunId, setEditingRunId] = useState<number | null>(null);
    const [editRunQty, setEditRunQty] = useState<number>(0);

    // --- Create Parent State ---
    const [isCreatingParent, setIsCreatingParent] = useState(false);
    const [newParent, setNewParent] = useState({ sku: '', name: '' });

    // --- Edit Component Cost State ---
    const [editingCostId, setEditingCostId] = useState<string | null>(null);
    const [editCostValue, setEditCostValue] = useState<number>(0);

    // --- Selection State ---
    const [selectedRunIds, setSelectedRunIds] = useState<Set<number>>(new Set());

    function toggleSelectRun(id: number) {
        const next = new Set(selectedRunIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedRunIds(next);
    }

    function toggleSelectAllRuns() {
        if (selectedRunIds.size === productionRuns.length) {
            setSelectedRunIds(new Set());
        } else {
            setSelectedRunIds(new Set(productionRuns.map(r => r.id)));
        }
    }

    async function handleDeleteRun(id: number) {
        showConfirm('Are you sure you want to delete this production run history?', async () => {
            const res = await deleteProductionRun(id);
            if (res.success) {
                loadData();
                showAlert('Run history deleted', 'success');
            } else {
                showAlert('Failed to delete run', 'error');
            }
        });
    }

    async function handleBulkDeleteRuns() {
        showConfirm(`Delete ${selectedRunIds.size} records?`, async () => {
            const res = await bulkDeleteProductionRuns(Array.from(selectedRunIds));
            if (res.success) {
                setSelectedRunIds(new Set());
                loadData();
                showAlert('Records deleted', 'success');
            } else {
                showAlert('Failed to delete records', 'error');
            }
        });
    }

    async function handleUpdateCost(id: number) {
        if (editCostValue < 0) {
            showAlert('Cost cannot be negative', 'warning');
            return;
        }

        const res = await updateItemCost(id, editCostValue);
        if (res.success) {
            setEditingCostId(null);
            loadData(); // Refresh component/parent lists to reflect new cost
            showAlert('Cost updated', 'success');
        } else {
            showAlert(res.error || 'Failed to update cost', 'error');
        }
    }

    async function handleDeleteParent() {
        if (!selectedParentId) return;

        showConfirm('Are you sure you want to delete this product? This will also remove its assembly structure (BOM).', async () => {
            const res = await deleteItem(parseInt(selectedParentId));

            if (res.success) {
                showAlert('Product deleted successfully', 'success');
                setSelectedParentId('');
                setBomLines([]);
                loadData(); // Refresh list
            } else {
                showAlert(res.error || 'Failed to delete product', 'error');
            }
        });
    }

    async function handleCreateParent() {
        if (!newParent.sku || !newParent.name) {
            showAlert('Please enter SKU and Name', 'warning');
            return;
        }

        const res = await createItem({
            sku: newParent.sku,
            name: newParent.name,
            type: 'Product', // Default to Product for assembly parents
            cost: 0,
            price: 0,
            minStock: 0
        });

        if (res.success && res.data) {
            showAlert('Product created!', 'success');
            setNewParent({ sku: '', name: '' });
            setIsCreatingParent(false);
            loadData(); // Reload lists
            setSelectedParentId(String(res.data.id)); // Auto-select new item
        } else {
            showAlert(res.error || 'Failed to create product', 'error');
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (selectedParentId) {
            loadParentBOM(parseInt(selectedParentId));
            // Find parent to set initial cost/price
            const p = parents.find(x => x.id === parseInt(selectedParentId));
            if (p) {
                setParentCost(p.cost || 0);
                setParentPrice(p.price || 0);
            }
        } else {
            setBomLines([]);
            setParentCost(0);
            setParentPrice(0);
        }
    }, [selectedParentId, parents]);

    // Recalculate component cost whenever BOM lines or components change
    useEffect(() => {
        let total = 0;
        bomLines.forEach(line => {
            if (line.childId) {
                const comp = components.find(c => c.id === parseInt(line.childId));
                if (comp) {
                    total += (comp.cost || 0) * line.quantity;
                }
            }
        });
        setCalculatedCost(total);
    }, [bomLines, components]);

    async function loadData() {
        const [pRes, cRes, runRes] = await Promise.all([
            getAssemblyParents(),
            getComponentOptions(),
            getProductionRuns()
        ]);
        if (pRes.success) setParents(pRes.data || []);
        if (cRes.success) setComponents(cRes.data || []);
        if (runRes.success) setProductionRuns(runRes.data || []);
    }

    async function loadParentBOM(id: number) {
        setIsLoadingBOM(true);
        const res = await getBOM(id);
        if (res.success && res.data) {
            setBomLines(res.data.map(line => ({
                childId: String(line.childId),
                quantity: line.quantity
            })));
        } else {
            setBomLines([]);
        }
        setIsLoadingBOM(false);
    }

    // --- Define Handlers ---

    const addBomLine = () => {
        setBomLines([...bomLines, { childId: '', quantity: 1 }]);
    };

    const updateBomLine = (index: number, field: 'childId' | 'quantity', value: any) => {
        const newLines = [...bomLines];
        newLines[index] = { ...newLines[index], [field]: value };
        setBomLines(newLines);
    };

    const removeBomLine = (index: number) => {
        setBomLines(bomLines.filter((_, i) => i !== index));
    };

    async function handleSaveBOM() {
        if (!selectedParentId) {
            showAlert('Please select a parent item.', 'warning');
            return;
        }

        // Validation
        const validLines = bomLines.filter(l => l.childId && l.quantity > 0);
        if (validLines.length === 0) {
            showAlert('Please add at least one component.', 'warning');
            return;
        }

        const res = await saveBOM(
            parseInt(selectedParentId),
            validLines.map(l => ({
                childId: parseInt(l.childId),
                quantity: l.quantity
            })),
            { cost: parentCost, price: parentPrice }
        );

        if (res.success) {
            showAlert('Assembly structure & pricing saved successfully!', 'success');
            loadData(); // Refresh parents to update costs in dropdown/state
        } else {
            showAlert(res.error || 'Failed to save.', 'error');
        }
    }

    // --- Run Handlers ---

    async function handleRunProduction() {
        if (!runParentId) {
            showAlert('Please select a product to assemble.', 'warning');
            return;
        }
        if (runQuantity <= 0) {
            showAlert('Quantity must be greater than 0.', 'warning');
            return;
        }

        showConfirm(`Confirm production of ${runQuantity} units? This will deduct component stock.`, async () => {
            const snList = serialNumbers.split(',').map(s => s.trim()).filter(Boolean);
            const parent = parents.find(p => String(p.id) === runParentId);

            if (parent?.isSerialized && snList.length !== runQuantity) {
                showAlert(`This item is serialized. You must provide exactly ${runQuantity} serial numbers.`, 'warning');
                return;
            }

            setRunStatus('idle');
            setRunMessage('');

            const res = await runProduction(parseInt(runParentId), runQuantity, snList);

            if (res.success) {
                setRunStatus('success');
                setRunMessage('Production complete! Stock updated.');
                setRunQuantity(1);
                setSerialNumbers('');
            } else {
                setRunStatus('error');
                setRunMessage(res.error || 'Production failed.');
            }
        });
    }

    async function handleUpdateRun(id: number) {
        if (editRunQty <= 0) {
            showAlert('Quantity must be positive', 'warning');
            return;
        }

        const res = await updateProductionRun(id, editRunQty);
        if (res.success) {
            setProductionRuns(prev => prev.map(r => r.id === id ? { ...r, quantity: editRunQty } : r));
            setEditingRunId(null);
            showAlert('Run quantity updated. Stock adjusted automatically.', 'success');
            // Reload parents to see updated stock there too
            const pRes = await getAssemblyParents();
            if (pRes.success) setParents(pRes.data || []);
        } else {
            showAlert(res.error || 'Failed to update run', 'error');
        }
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Production</h1>
                    <p>Define assemblies and run production batches.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-card)', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('define')}
                        className={`btn ${activeTab === 'define' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ cursor: 'pointer' }}
                    >
                        <Settings size={16} /> Define Assembly
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('run')}
                        className={`btn ${activeTab === 'run' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ cursor: 'pointer' }}
                    >
                        <Play size={16} /> Run Production
                    </button>
                </div>
            </div>

            {/* --- DEFINE ASSEMBLY TAB --- */}
            {activeTab === 'define' && (
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Settings size={20} /> Define Structure (BOM)
                    </h3>

                    <div style={{ marginBottom: '2rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Select Product / Assembly (Parent)</label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <select
                                className="input-group"
                                style={{ flex: 1, minWidth: '200px', maxWidth: '400px', padding: '0.75rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                                value={selectedParentId}
                                onChange={(e) => setSelectedParentId(e.target.value)}
                            >
                                <option value="">-- Select Item --</option>
                                {parents.map(p => (
                                    <option key={p.id} value={p.id}>{p.sku} - {p.name}</option>
                                ))}
                            </select>
                            <button
                                className="btn btn-outline"
                                onClick={() => setIsCreatingParent(!isCreatingParent)}
                            >
                                <Plus size={16} /> New Product
                            </button>
                            {selectedParentId && isAdmin && (
                                <button
                                    className="btn btn-outline"
                                    onClick={handleDeleteParent}
                                    style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                    title="Delete this Product"
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>

                        {isCreatingParent && (
                            <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', background: 'var(--bg-dark)' }}>
                                <h4 style={{ marginBottom: '0.5rem' }}>Create New Product</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>SKU</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                                            value={newParent.sku}
                                            onChange={e => setNewParent({ ...newParent, sku: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Name</label>
                                        <input
                                            type="text"
                                            className="input-group"
                                            style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                                            value={newParent.name}
                                            onChange={e => setNewParent({ ...newParent, name: e.target.value })}
                                        />
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCreateParent}
                                        style={{ height: '38px' }}
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedParentId && (
                        <div>
                            <h4 style={{ marginBottom: '1rem' }}>Components (Children)</h4>
                            {isLoadingBOM ? (
                                <p style={{ color: 'var(--text-muted)' }}>Loading existing BOM...</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {bomLines.length === 0 && (
                                        <div style={{ padding: '1rem', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                                            No components defined. Add parts below.
                                        </div>
                                    )}

                                    {bomLines.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 100px 100px 120px 40px', gap: '1rem', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <div>Component</div>
                                            <div>Quantity</div>
                                            <div>Line Cost</div>
                                            <div>Unit Cost / Edit</div>
                                            <div></div>
                                        </div>
                                    )}

                                    {bomLines.map((line, index) => {
                                        const comp = components.find(c => String(c.id) === line.childId);
                                        const lineCost = comp ? (comp.cost * line.quantity).toFixed(2) : '0.00';

                                        return (
                                            <div key={index} style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 100px 100px 120px 40px', gap: '1rem', alignItems: 'center' }}>
                                                <select
                                                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                                                    value={line.childId}
                                                    onChange={(e) => updateBomLine(index, 'childId', e.target.value)}
                                                >
                                                    <option value="">-- Select --</option>
                                                    {components
                                                        .filter(c => c.id !== parseInt(selectedParentId)) // Prevent self-reference
                                                        .map(c => (
                                                            <option key={c.id} value={String(c.id)}>
                                                                {c.sku} - {c.name} (Stk: {c.currentStock})
                                                            </option>
                                                        ))}
                                                </select>

                                                <input
                                                    type="number"
                                                    placeholder="Qty"
                                                    min="0.0001"
                                                    step="any"
                                                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                                                    value={line.quantity}
                                                    onChange={(e) => updateBomLine(index, 'quantity', parseFloat(e.target.value))}
                                                />

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>$</span>
                                                    {lineCost}
                                                </div>

                                                {/* Cost Editing Column */}
                                                <div>
                                                    {comp && String(comp.id) === editingCostId ? (
                                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                style={{ width: '60px', padding: '0.25rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                                                value={editCostValue}
                                                                onChange={e => setEditCostValue(parseFloat(e.target.value))}
                                                                autoFocus
                                                            />
                                                            <button onClick={() => handleUpdateCost(comp.id)} style={{ color: '#10b981', background: 'none', border: 'none', cursor: 'pointer' }} title="Save"><Save size={16} /></button>
                                                            <button onClick={() => setEditingCostId(null)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }} title="Cancel">✕</button>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', opacity: 0.8 }}
                                                            onClick={() => {
                                                                if (comp) {
                                                                    setEditingCostId(String(comp.id));
                                                                    setEditCostValue(comp.cost);
                                                                }
                                                            }}
                                                            title="Click to edit generic item cost"
                                                        >
                                                            <span style={{ fontSize: '0.85rem' }}>${comp?.cost.toFixed(2)}/u</span>
                                                            <Settings size={12} />
                                                        </div>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => removeBomLine(index)}
                                                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
                                                    title="Remove Component"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        )
                                    })}

                                    <div style={{ marginTop: '0.5rem', marginBottom: '2rem' }}>
                                        <button className="btn btn-outline" onClick={addBomLine}>
                                            <Plus size={16} /> Add Component
                                        </button>
                                    </div>

                                    {/* Cost & Price Section */}
                                    <div style={{ background: 'var(--bg-dark)', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ margin: '0 0 1rem 0' }}>Costing & Pricing</h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', alignItems: 'end' }}>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Sum of Components</label>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                                                    ${calculatedCost.toFixed(2)}
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Product Cost</label>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="input-group"
                                                        style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                                                        value={parentCost}
                                                        onChange={e => setParentCost(parseFloat(e.target.value))}
                                                    />
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '0.5rem', fontSize: '0.8rem' }}
                                                        title="Set from sum"
                                                        onClick={() => setParentCost(calculatedCost)}
                                                    >
                                                        Use Sum
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Selling Price</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="input-group"
                                                    style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', color: 'white', border: '1px solid var(--border-color)', borderRadius: '4px' }}
                                                    value={parentPrice}
                                                    onChange={e => setParentPrice(parseFloat(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-primary" onClick={handleSaveBOM} style={{ padding: '0.75rem 2rem' }}>
                                            <Save size={18} /> Save Structure & Price
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* --- RUN PRODUCTION TAB --- */}
            {activeTab === 'run' && (
                <div className="card">
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Play size={20} /> Execute Assembly
                    </h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Product to Assemble</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <select
                                        className="input-group"
                                        style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                                        value={runParentId}
                                        onChange={(e) => setRunParentId(e.target.value)}
                                    >
                                        <option value="">-- Select Product --</option>
                                        {parents.map(p => (
                                            <option key={p.id} value={p.id}>{p.sku} - {p.name} (Stock: {p.currentStock})</option>
                                        ))}
                                    </select>
                                    {runParentId && isAdmin && (
                                        <button
                                            className="btn btn-outline"
                                            onClick={async () => {
                                                showConfirm('Are you sure you want to delete this product? This will also remove its assembly structure (BOM) and production history.', async () => {
                                                    const res = await deleteItem(parseInt(runParentId));
                                                    if (res.success) {
                                                        showAlert('Product deleted successfully', 'success');
                                                        setRunParentId('');
                                                        loadData();
                                                    } else {
                                                        showAlert(res.error || 'Failed to delete product', 'error');
                                                    }
                                                });
                                            }}
                                            style={{ borderColor: '#ef4444', color: '#ef4444' }}
                                            title="Delete this Product"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Quantity to Produce</label>
                                <input
                                    type="number"
                                    className="input-group"
                                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                                    value={runQuantity}
                                    onChange={(e) => setRunQuantity(parseFloat(e.target.value))}
                                    min="0.0001"
                                    step="any"
                                />
                            </div>

                            {/* Serial Number Input if Serialized */}
                            {(() => {
                                const parent = parents.find(p => String(p.id) === runParentId);
                                if (parent?.isSerialized) {
                                    return (
                                        <div style={{ marginBottom: '1.5rem' }}>
                                            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Serial Numbers (Comma Separated)</label>
                                            <textarea
                                                className="input-group"
                                                style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-dark)', color: 'white', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', minHeight: '80px' }}
                                                value={serialNumbers}
                                                onChange={(e) => setSerialNumbers(e.target.value)}
                                                placeholder="SN001, SN002, SN003..."
                                            />
                                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                                Entered: {serialNumbers.split(',').map(s => s.trim()).filter(Boolean).length} / Required: {runQuantity}
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            })()}


                            <button className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} onClick={handleRunProduction}>
                                Assemble & Update Stock
                            </button>
                        </div>

                        <div style={{ background: 'var(--bg-dark)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                            <h4>Info</h4>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                Running production will:
                            </p>
                            <ul style={{ paddingLeft: '1.5rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                                <li>Verify sufficient stock for all components.</li>
                                <li>Deduct component quantities from inventory.</li>
                                <li>Increase the finished product stock.</li>
                                <li>Fail if any component is missing.</li>
                            </ul>

                            {runMessage && (
                                <div style={{
                                    marginTop: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)',
                                    background: runStatus === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                    color: runStatus === 'success' ? '#10b981' : '#ef4444',
                                    border: `1px solid ${runStatus === 'success' ? '#10b981' : '#ef4444'}`
                                }}>
                                    {runStatus === 'success' ? <PackageCheck size={24} style={{ marginBottom: '0.5rem' }} /> : null}
                                    <div>{runMessage}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* --- History List --- */}
                    <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <History size={20} /> Recent Production Runs
                        </h3>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                                    <th style={{ padding: '0.75rem', width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            onChange={toggleSelectAllRuns}
                                            checked={productionRuns.length > 0 && selectedRunIds.size === productionRuns.length}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                        />
                                    </th>
                                    <th style={{ padding: '0.75rem' }}>ID</th>
                                    <th style={{ padding: '0.75rem' }}>Date</th>
                                    <th style={{ padding: '0.75rem' }}>Product</th>
                                    <th style={{ padding: '0.75rem' }}>Qty Produced</th>
                                    <th style={{ padding: '0.75rem' }}>Status</th>
                                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>
                                        {selectedRunIds.size > 0 && isAdmin && (
                                            <button
                                                className="btn btn-sm btn-outline"
                                                onClick={handleBulkDeleteRuns}
                                                style={{ color: '#ef4444', borderColor: '#ef4444', padding: '0.25rem 0.5rem' }}
                                            >
                                                Delete ({selectedRunIds.size})
                                            </button>
                                        )}
                                        {selectedRunIds.size === 0 && 'Actions'}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {productionRuns.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No production history yet.
                                        </td>
                                    </tr>
                                ) : (
                                    productionRuns.map(run => (
                                        <tr key={run.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                            <td style={{ padding: '0.75rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRunIds.has(run.id)}
                                                    onChange={() => toggleSelectRun(run.id)}
                                                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                                />
                                            </td>
                                            <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>#{run.id}</td>
                                            <td style={{ padding: '0.75rem' }}>{new Date(run.createdAt).toLocaleDateString()} {new Date(run.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                            <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                                                {run.item ? (
                                                    `${run.item.sku} - ${run.item.name}`
                                                ) : (
                                                    <span style={{ color: '#ef4444', fontStyle: 'italic' }}>
                                                        Deleted Product (Item #{run.itemId})
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                {editingRunId === run.id ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <input
                                                            type="number"
                                                            value={editRunQty}
                                                            onChange={e => setEditRunQty(parseFloat(e.target.value))}
                                                            style={{ width: '80px', padding: '0.25rem', background: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '4px', color: 'white' }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>{run.quantity}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>{run.status}</span>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                {editingRunId === run.id ? (
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button
                                                            onClick={() => handleUpdateRun(run.id)}
                                                            className="btn btn-primary"
                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingRunId(null)}
                                                            className="btn btn-outline"
                                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => {
                                                                setEditingRunId(run.id);
                                                                setEditRunQty(run.quantity);
                                                            }}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', opacity: 0.6 }}
                                                            title="Edit Quantity"
                                                        >
                                                            <Edit2 size={16} />
                                                        </button>
                                                        {isAdmin && (
                                                            <button
                                                                onClick={() => handleDeleteRun(run.id)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6 }}
                                                                title="Delete Run"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
