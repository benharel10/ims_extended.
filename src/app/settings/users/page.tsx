'use client'

import React, { useState, useEffect } from 'react';
import { useSystem } from '@/components/SystemProvider';
import { getUsers, createUser, deleteUser, getSystemLogStats, purgeSystemLogs } from './actions';
import { Plus, Trash2, User, Shield, ShieldAlert, Mail, Database, Activity, Loader2 } from 'lucide-react';

export default function UsersPage() {
    const { user, showAlert, showConfirm } = useSystem();
    const isAdmin = user?.role === 'Admin';
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'Warehouse' });
    
    // Dynamic tab configurations
    const [activeTab, setActiveTab] = useState<'Users' | 'Maintenance'>('Users');
    const [logStats, setLogStats] = useState({ systemLogCount: 0, icountLogCount: 0 });
    const [maintenanceLoading, setMaintenanceLoading] = useState(false);

    useEffect(() => {
        if (isAdmin) {
            loadUsers();
        } else {
            setLoading(false);
        }
    }, [isAdmin]);

    async function loadUsers() {
        setLoading(true);
        const res = await getUsers();
        if (res.success) {
            setUsers(res.data || []);
        } else {
            showAlert('Failed to load users: ' + res.error, 'error');
        }
        setLoading(false);
    }

    async function handleCreate() {
        if (!newUser.name || !newUser.email || !newUser.password) {
            showAlert('Please fill all required fields', 'warning');
            return;
        }

        const res = await createUser(newUser);
        if (res.success) {
            setShowModal(false);
            setNewUser({ name: '', email: '', password: '', role: 'Warehouse' });
            loadUsers();
            showAlert('User created successfully', 'success');
        } else {
            showAlert(res.error || 'Failed to create user', 'error');
        }
    }

    async function handleDelete(id: number) {
        showConfirm('Are you sure you want to delete this user?', async () => {
            const res = await deleteUser(id);
            if (res.success) {
                loadUsers();
                showAlert('User deleted', 'success');
            } else {
                showAlert(res.error || 'Failed to delete user', 'error');
            }
        });
    }

    // Log optimization actions
    async function loadLogStats() {
        setMaintenanceLoading(true);
        const res = await getSystemLogStats();
        if (res.success && res.data) {
            setLogStats(res.data);
        }
        setMaintenanceLoading(false);
    }

    async function handlePurge(days: number | 'all') {
        const scope = days === 'all' ? 'all existing history' : `everything older than ${days} days`;
        showConfirm(`Are you ABSOLUTELY certain you want to permanently purge ${scope} from database logs? This process clears server disk storage and cannot be undone.`, async () => {
            setMaintenanceLoading(true);
            const res = await purgeSystemLogs(days);
            if (res.success) {
                showAlert(res.message || 'Database successfully optimized', 'success');
                loadLogStats();
            } else {
                showAlert(res.error || 'Purge operation failed', 'error');
            }
            setMaintenanceLoading(false);
        });
    }

    if (!isAdmin) {
        return (
            <div className="p-8 text-center">
                <ShieldAlert size={48} className="mx-auto text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-red-500">Access Denied</h2>
                <p className="text-gray-500 mt-2">Only Administrators can access this page.</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h1>Settings & Maintenance</h1>
                    <p>Configure permissions and optimize your database instance.</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
                <button 
                    onClick={() => setActiveTab('Users')}
                    style={{
                        padding: '0.75rem 1.25rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'Users' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'Users' ? 'var(--primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'Users' ? 600 : 400,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <User size={18} />
                    Users Management
                </button>
                <button 
                    onClick={() => { setActiveTab('Maintenance'); loadLogStats(); }}
                    style={{
                        padding: '0.75rem 1.25rem',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'Maintenance' ? '3px solid var(--primary)' : '3px solid transparent',
                        color: activeTab === 'Maintenance' ? 'var(--primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'Maintenance' ? 600 : 400,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    <Database size={18} />
                    Database Maintenance
                </button>
            </div>

            {activeTab === 'Users' ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0 }}>Active User Profiles</h3>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                            <Plus size={18} />
                            Add User
                        </button>
                    </div>

                    {loading ? <div>Loading users...</div> : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {users.map(user => (
                                <div key={user.id} className="card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '12px',
                                            background: user.role === 'Admin' ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-hover)',
                                            color: user.role === 'Admin' ? 'var(--primary)' : 'var(--text-muted)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {user.role === 'Admin' ? <ShieldAlert size={24} /> : <User size={24} />}
                                        </div>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{user.name}</h3>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                                <Mail size={14} />
                                                {user.email}
                                            </div>
                                            <div className={`badge ${user.role === 'Admin' ? 'badge-primary' : 'badge-secondary'}`} style={{ marginTop: '0.75rem', display: 'inline-block' }}>
                                                {user.role}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDelete(user.id)}
                                        className="btn btn-sm btn-outline"
                                        style={{ color: '#ef4444', borderColor: '#ef4444', padding: '0.5rem' }}
                                        title="Delete User"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ) : (
                <div className="card" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <Activity size={24} className="text-primary" style={{ color: 'var(--primary)' }} />
                        <h2 style={{ margin: 0 }}>System Storage & Log Retention</h2>
                    </div>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        Every system audit, item transfer, and simulated ERP synchronization produces rows in your database. 
                        Purging historical logs reclaims performance and ensures you remain within database tier limitations.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ marginBottom: '2rem' }}>
                        <div style={{ padding: '1.5rem', background: 'var(--bg-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                System Audit Action Logs
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {maintenanceLoading ? <Loader2 className="animate-spin text-muted" size={24} /> : logStats.systemLogCount.toLocaleString()}
                                <span style={{ fontSize: '0.9rem', fontWeight: '400', color: 'var(--text-muted)' }}>entries</span>
                            </div>
                        </div>
                        <div style={{ padding: '1.5rem', background: 'var(--bg-hover)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                iCount Integration Sync Logs
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {maintenanceLoading ? <Loader2 className="animate-spin text-muted" size={24} /> : logStats.icountLogCount.toLocaleString()}
                                <span style={{ fontSize: '0.9rem', fontWeight: '400', color: 'var(--text-muted)' }}>entries</span>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '1.25rem', borderRadius: '12px', display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>⚠️</span>
                        <div>
                            <h4 style={{ margin: 0, color: '#f59e0b', marginBottom: '0.25rem' }}>Attention Required</h4>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                Purging logs removes metadata history used for viewing old actions in Settings/Finance tabs. 
                                This will <strong>not</strong> affect actual inventory stock levels, orders, BOMs, or invoices.
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        <button 
                            className="btn btn-outline" 
                            disabled={maintenanceLoading}
                            onClick={() => handlePurge(30)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            Purge Logs &gt; 30 Days
                        </button>
                        <button 
                            className="btn btn-outline" 
                            disabled={maintenanceLoading}
                            onClick={() => handlePurge(90)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            Purge Logs &gt; 90 Days
                        </button>
                        <button 
                            className="btn" 
                            disabled={maintenanceLoading}
                            onClick={() => handlePurge('all')}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.5rem', 
                                background: '#ef4444', 
                                color: 'white',
                                border: 'none'
                            }}
                        >
                            Purge ALL Log History
                        </button>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2 style={{ marginBottom: '1.5rem' }}>Add New User</h2>

                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text" className="input-group" placeholder="e.g. John Doe"
                                value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Email Address</label>
                            <input
                                type="email" className="input-group" placeholder="john@ksw.com"
                                value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password" className="input-group" placeholder="••••••••"
                                value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label>Role</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn"
                                    onClick={() => setNewUser({ ...newUser, role: 'Warehouse' })}
                                    style={{
                                        flex: 1,
                                        background: newUser.role === 'Warehouse' ? 'var(--primary)' : 'var(--bg-hover)',
                                        color: newUser.role === 'Warehouse' ? 'white' : 'var(--text-muted)'
                                    }}
                                >
                                    Warehouse (User)
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => setNewUser({ ...newUser, role: 'Admin' })}
                                    style={{
                                        flex: 1,
                                        background: newUser.role === 'Admin' ? 'var(--danger)' : 'var(--bg-hover)',
                                        color: newUser.role === 'Admin' ? 'white' : 'var(--text-muted)'
                                    }}
                                >
                                    Admin
                                </button>
                            </div>
                            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
                                {newUser.role === 'Admin' ? 'Full access to everything.' : 'Cannot see Finance, Reports, Sales. Cannot delete items.'}
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                            <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleCreate}>Create Account</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
