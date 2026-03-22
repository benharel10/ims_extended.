'use client';

import { useState, useEffect } from 'react';
import { getUnmappedItems, getInternalItems, saveSkuMapping } from './actions';
import { useSystem } from '@/components/SystemProvider';
import { Link2, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function MapperPage() {
    const { showAlert, showConfirm } = useSystem();
    const [loading, setLoading] = useState(true);
    const [unmappedItems, setUnmappedItems] = useState<any[]>([]);
    const [internalItems, setInternalItems] = useState<any[]>([]);
    const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        const [resUnmapped, resInternal] = await Promise.all([
            getUnmappedItems(),
            getInternalItems()
        ]);
        if (resUnmapped.success && resInternal.success) {
            setUnmappedItems(resUnmapped.data || []);
            setInternalItems(resInternal.data || []);
        } else {
            showAlert('Failed to load mapping data', 'error');
        }
        setLoading(false);
    }

    async function handleLink(externalSku: string, externalName: string, internalItemId: number) {
        if (!internalItemId) return;
        
        await showConfirm('Confirm Mapping', async () => {
            const res = await saveSkuMapping(externalSku, externalName, internalItemId);
            if (res.success) {
                showAlert(res.message || 'Mapping saved correctly!', 'success');
                // Remove the row instantly from the UI 
                setUnmappedItems(prev => prev.filter(item => item.newItemSku !== externalSku));
            } else {
                showAlert(res.error || 'Failed to save mapping', 'error');
            }
        }, `Are you sure you want to permanently map [${externalSku}] to this internal database item? This action affects all existing pending POs.`);
    }

    // Fuzzy matching filter helper
    const getFilteredItems = (query: string) => {
        if (!query) return [];
        const lowQuery = query.toLowerCase();
        return internalItems.filter(item => 
            item.name.toLowerCase().includes(lowQuery) || 
            item.sku.toLowerCase().includes(lowQuery) ||
            (item.description && item.description.toLowerCase().includes(lowQuery))
        ).slice(0, 50); // cap answers list to top 50 
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        🔗 iCount SKU Mapper
                    </h1>
                    <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                        Identify external products sent via iCount Webhooks that don't match your database.
                    </p>
                </div>
                <div>
                    <Link href="/purchasing" className="btn btn-outline">Back to Purchasing</Link>
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Analyzing PO histories...</div>
            ) : unmappedItems.length === 0 ? (
                <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
                    <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 1rem auto' }} />
                    <h2 style={{ fontSize: '1.25rem', margin: 0 }}>All clear!</h2>
                    <p style={{ color: 'var(--text-muted)' }}>There are no unidentified external SKUs pending mapping.</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: 'var(--bg-dark)', borderBottom: '1px solid var(--border-color)' }}>
                            <tr>
                                <th style={{ padding: '1rem', textAlign: 'left', width: '40%' }}>External Item (iCount)</th>
                                <th style={{ padding: '1rem', textAlign: 'left', width: '60%' }}>Internal Match via Fuzzy Search</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unmappedItems.map((item, index) => {
                                const q = searchQueries[item.newItemSku] ?? item.newItemName ?? '';
                                const filtered = getFilteredItems(q);
                                
                                return (
                                    <tr key={item.newItemSku || index} style={{ borderBottom: '1px solid var(--border-color)', background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                                <AlertCircle size={20} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{item.newItemName}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>SKU: {item.newItemSku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {/* Search Input */}
                                                <div className="input-group" style={{ display: 'flex', alignItems: 'center', padding: '0.5rem', background: 'var(--bg-dark)', borderRadius: '6px' }}>
                                                    <Search size={16} color="var(--text-muted)" style={{ margin: '0 0.5rem' }} />
                                                    <input 
                                                        type="text" 
                                                        placeholder="Search your database for a match..."
                                                        value={q}
                                                        onChange={(e) => setSearchQueries({ ...searchQueries, [item.newItemSku]: e.target.value })}
                                                        style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', color: 'var(--text-main)', fontSize: '0.9rem' }}
                                                    />
                                                </div>
                                                
                                                {/* Fuzzy Search Results Dropdown-like display */}
                                                {q.length > 1 && (
                                                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', background: 'var(--bg-panel)' }}>
                                                        {filtered.length === 0 ? (
                                                            <div style={{ padding: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>No database items match this search.</div>
                                                        ) : (
                                                            filtered.map(dbItem => (
                                                                <div 
                                                                    key={dbItem.id} 
                                                                    style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                                                                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                                                >
                                                                    <div>
                                                                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{dbItem.name}</div>
                                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dbItem.sku}</div>
                                                                    </div>
                                                                    <button 
                                                                        className="btn btn-outline" 
                                                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                                                                        onClick={() => handleLink(item.newItemSku, item.newItemName, dbItem.id)}
                                                                    >
                                                                        <Link2 size={14} style={{ marginRight: '0.25rem' }} /> Link
                                                                    </button>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
