'use client'

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Package,
    Factory,
    ShoppingCart,
    DollarSign,
    BarChart4,
    Settings,
    Truck,
    LogOut
} from 'lucide-react';
import { logoutAction } from '../app/auth/actions';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Inventory', href: '/inventory', icon: Package },
    { name: 'Production', href: '/production', icon: Factory },
    { name: 'Sales', href: '/sales', icon: DollarSign },
    { name: 'Shipping', href: '/shipping', icon: Truck },
    { name: 'Purchasing', href: '/purchasing', icon: ShoppingCart },
    { name: 'Finance', href: '/finance', icon: DollarSign },
    { name: 'Reports', href: '/reports', icon: BarChart4 },
];

import { useSystem } from '@/components/SystemProvider';


export function Sidebar() {
    const { user, showConfirm } = useSystem();
    const pathname = usePathname();

    const isAdmin = user?.role === 'Admin';

    // Filter Items
    const filteredItems = navItems.filter(item => {
        // Admin sees everything
        if (isAdmin) return true;

        // Non-Admins cannot see Finance, Reports, Sales
        if (['Finance', 'Reports', 'Sales'].includes(item.name)) return false;

        return true;
    });

    return (
        <div className="sidebar">
            <div style={{ marginBottom: '2rem', padding: '0 0.5rem' }}>
                <img src="/logo-dark-mode.svg" alt="KSW Inventory" style={{ width: '180px', height: 'auto' }} />
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={isActive ? 'text-primary bg-primary/10' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '0.75rem 1rem',
                                borderRadius: '0.5rem',
                                background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                                fontWeight: isActive ? 600 : 400,
                                borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            <Icon size={20} />
                            {item.name}
                        </Link>
                    );
                })}

                {isAdmin && (
                    <Link
                        href="/settings/users"
                        className={pathname === '/settings/users' ? 'text-primary bg-primary/10' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: '0.5rem',
                            marginTop: '1rem',
                            background: pathname === '/settings/users' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            color: pathname === '/settings/users' ? 'var(--primary)' : 'var(--text-muted)',
                            fontWeight: pathname === '/settings/users' ? 600 : 400,
                            borderLeft: pathname === '/settings/users' ? '3px solid var(--primary)' : '3px solid transparent',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Settings size={20} />
                        Users & Settings
                    </Link>
                )}
            </nav>

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
                            {user?.name?.[0] || 'U'}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{user?.name || 'Guest'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.role || 'Viewer'}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            showConfirm('Are you sure you want to log out?', () => {
                                logoutAction();
                            });
                        }}
                        className="btn btn-sm"
                        style={{ padding: '0.5rem', color: 'var(--text-muted)', border: 'none', background: 'transparent' }}
                        title="Sign Out"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
