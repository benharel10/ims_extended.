'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface Alert {
    id: number;
    message: string;
    type: AlertType;
}

interface Confirm {
    isOpen: boolean;
    message: string;
    description?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

interface User {
    id: number;
    email: string;
    name: string;
    role: string;
}

interface SystemContextType {
    user?: User;
    showAlert: (message: string, type?: AlertType) => void;
    showConfirm: (message: string, onConfirm: () => void, description?: string) => void;
}

const SystemContext = createContext<SystemContextType | undefined>(undefined);

export function useSystem() {
    const context = useContext(SystemContext);
    if (!context) {
        throw new Error('useSystem must be used within a SystemProvider');
    }
    return context;
}

export function SystemProvider({ children, user }: { children: ReactNode, user?: User }) {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [confirmState, setConfirmState] = useState<Confirm>({
        isOpen: false,
        message: '',
        onConfirm: () => { },
        onCancel: () => { }
    });

    const showAlert = (message: string, type: AlertType = 'info') => {
        const id = Date.now() + Math.random();
        setAlerts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setAlerts(prev => prev.filter(a => a.id !== id));
        }, 5000); // Auto remove after 5s
    };

    const showConfirm = (message: string, onConfirm: () => void, description?: string) => {
        setConfirmState({
            isOpen: true,
            message,
            description,
            onConfirm: () => {
                onConfirm();
                setConfirmState(prev => ({ ...prev, isOpen: false }));
            },
            onCancel: () => {
                setConfirmState(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    return (
        <SystemContext.Provider value={{ user, showAlert, showConfirm }}>
            {children}

            {/* Alerts Container (Fixed Top Right) */}
            <div style={{
                position: 'fixed',
                top: '1rem',
                right: '1rem',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                pointerEvents: 'none' // Allow clicking through if needed, but alerts should be interactive?
            }}>
                {alerts.map(alert => (
                    <div
                        key={alert.id}
                        className="animate-fade-in"
                        style={{
                            pointerEvents: 'auto',
                            background: 'var(--bg-card)',
                            border: `1px solid ${alert.type === 'error' ? '#ef4444' : alert.type === 'success' ? '#10b981' : alert.type === 'warning' ? '#f59e0b' : 'var(--border-color)'}`,
                            padding: '1rem',
                            borderRadius: 'var(--radius-md)',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                            display: 'flex',
                            alignItems: 'start',
                            gap: '0.75rem',
                            minWidth: '300px',
                            maxWidth: '400px',
                            color: 'white'
                        }}
                    >
                        <div style={{ marginTop: '2px' }}>
                            {alert.type === 'success' && <CheckCircle size={20} color="#10b981" />}
                            {alert.type === 'error' && <AlertCircle size={20} color="#ef4444" />}
                            {alert.type === 'warning' && <AlertTriangle size={20} color="#f59e0b" />}
                            {alert.type === 'info' && <AlertCircle size={20} color="#3b82f6" />}
                        </div>
                        <div style={{ flex: 1, fontSize: '0.95rem', lineHeight: '1.4' }}>
                            {alert.message}
                        </div>
                        <button
                            onClick={() => setAlerts(prev => prev.filter(a => a.id !== alert.id))}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Confirmation Dialog (Modal) */}
            {confirmState.isOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div className="card animate-fade-in" style={{ width: '400px', maxWidth: '90%', border: '1px solid var(--border-color)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '50%' }}>
                                <HelpCircle size={24} color="#f59e0b" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Confirmation</h3>
                        </div>

                        <div style={{ marginBottom: '1.5rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
                            <p style={{ fontWeight: 500, fontSize: '1.1rem', marginBottom: '0.5rem' }}>{confirmState.message}</p>
                            {confirmState.description && (
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{confirmState.description}</p>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button
                                className="btn btn-outline"
                                onClick={confirmState.onCancel}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={confirmState.onConfirm}
                                autoFocus
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </SystemContext.Provider>
    );
}
