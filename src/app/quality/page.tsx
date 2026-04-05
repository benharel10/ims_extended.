'use client'

import React, { useState, useEffect } from 'react';
import { getInspectionRecords, deleteInspectionRecord } from './actions';
import { useSystem } from '@/components/SystemProvider';
import { 
    Search, 
    Filter, 
    FileText, 
    Download, 
    Trash2, 
    CheckCircle2,
    XCircle,
    Calendar,
    User,
    Package,
    ShoppingCart,
    X
} from 'lucide-react';
import { format } from 'date-fns';
import { useDebounce } from '@/hooks/useDebounce'; // Assuming this exists or I will create it

export default function QualityPage() {
    const { user, showAlert, showConfirm } = useSystem();
    const isAdmin = user?.role === 'Admin';
    
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const debouncedSearch = useDebounce(search, 500);

    useEffect(() => {
        loadRecords();
    }, [statusFilter, debouncedSearch]);

    async function loadRecords() {
        setLoading(true);
        const res = await getInspectionRecords({ status: statusFilter, search: debouncedSearch });
        if (res.success) {
            setRecords(res.data || []);
        } else {
            showAlert(res.error || 'Failed to load records', 'error');
        }
        setLoading(false);
    }

    async function handleDelete(id: number) {
        showConfirm('Are you sure you want to delete this inspection record? This cannot be undone.', async () => {
            const res = await deleteInspectionRecord(id);
            if (res.success) {
                showAlert('Record deleted successfully', 'success');
                loadRecords();
            } else {
                showAlert(res.error || 'Failed to delete record', 'error');
            }
        });
    }

    function handleDownload(record: any) {
        try {
            const link = document.createElement('a');
            link.href = record.fileData;
            link.download = record.fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            showAlert('Failed to download file', 'error');
        }
    }

    return (
        <div className="animate-fade-in" style={{ padding: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h1>Quality Control</h1>
                    <p>History of all inspection reports and first article (FA) documents.</p>
                </div>
            </div>

            <div className="card" style={{ 
                padding: '1.25rem', 
                marginBottom: '2rem', 
                background: 'rgba(30, 41, 59, 0.5)', 
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
            }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '300px' }}>
                        <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input 
                            type="text" 
                            placeholder="Search SKU, PO, or File..." 
                            style={{ 
                                width: '100%', 
                                padding: '0.85rem 3rem 0.85rem 3rem', 
                                background: 'var(--bg-dark)', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '12px', 
                                color: 'white',
                                outline: 'none',
                                fontSize: '1rem',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = 'var(--primary)';
                                e.target.style.boxShadow = '0 0 0 4px var(--primary-glow), inset 0 2px 4px rgba(0,0,0,0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'var(--border-color)';
                                e.target.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.1)';
                            }}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {search && (
                            <button 
                                onClick={() => setSearch('')}
                                style={{ 
                                    position: 'absolute', 
                                    right: '1rem', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    background: 'var(--bg-hover)', 
                                    border: 'none', 
                                    borderRadius: '50%', 
                                    width: '24px', 
                                    height: '24px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {['All', 'Pass', 'Fail'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                style={{
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '10px',
                                    fontSize: '0.9rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    border: '1px solid',
                                    borderColor: statusFilter === status ? 'var(--primary)' : 'var(--border-color)',
                                    background: statusFilter === status ? 'var(--primary)' : 'transparent',
                                    color: statusFilter === status ? 'white' : 'var(--text-muted)',
                                    boxShadow: statusFilter === status ? '0 4px 12px var(--primary-glow)' : 'none'
                                }}
                            >
                                {status}
                            </button>
                        ))}
                    </div>

                    <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {loading ? 'Searching...' : `${records.length} record${records.length === 1 ? '' : 's'} found`}
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                     <div className="animate-spin inline-block mr-2">⏳</div>
                     Loading records...
                </div>
            ) : records.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                    <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                    <p>No inspection records found. Start by uploading reports from the Purchase Order page.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {records.map((record) => (
                        <div key={record.id} className="card hover-scale" style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', gap: '1.5rem', flex: 1 }}>
                                    <div style={{ 
                                        width: 48, 
                                        height: 48, 
                                        flexShrink: 0,
                                        borderRadius: '12px', 
                                        background: record.status === 'Pass' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                        color: record.status === 'Pass' ? '#22c55e' : '#ef4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {record.status === 'Pass' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{record.fileName}</span>
                                            <span style={{ 
                                                fontSize: '0.75rem', 
                                                padding: '0.2rem 0.5rem', 
                                                borderRadius: '999px', 
                                                background: record.status === 'Pass' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                color: record.status === 'Pass' ? '#22c55e' : '#ef4444',
                                                fontWeight: 600
                                            }}>
                                                {record.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '1.5rem', rowGap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <Package size={14} /> {record.item.sku} - {record.item.name}
                                            </span>
                                            {record.po && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                    <ShoppingCart size={14} /> {record.po.poNumber}
                                                </span>
                                            )}
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <Calendar size={14} /> {format(new Date(record.createdAt), 'MMM dd, yyyy HH:mm')}
                                            </span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <User size={14} /> {record.inspector.name}
                                            </span>
                                        </div>
                                        {record.notes && (
                                            <div style={{ marginTop: '0.75rem', fontSize: '0.9rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                <strong>Notes:</strong> {record.notes}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        className="btn btn-sm btn-outline" 
                                        onClick={() => handleDownload(record)}
                                        title="Download Report"
                                        style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                    >
                                        <Download size={16} />
                                    </button>
                                    {isAdmin && (
                                        <button 
                                            className="btn btn-sm btn-outline hover:bg-red-500/10" 
                                            onClick={() => handleDelete(record.id)}
                                            style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: '#ef4444' }}
                                            title="Delete Record"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
