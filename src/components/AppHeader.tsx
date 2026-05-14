'use client'

import React from 'react';
import { useSystem } from '@/components/SystemProvider';
import { LogOut } from 'lucide-react';
import { logoutAction } from '../app/auth/actions';

// Shown on mobile full-width header AND on iPad as a slim top-right bar
export function AppHeader({ variant = 'mobile' }: { variant?: 'mobile' | 'tablet' }) {
    const { user, showConfirm } = useSystem();

    if (variant === 'tablet') {
        // Slim tablet header — just shows user info + logout on the right
        return (
            <header className="app-header-tablet">
                <div className="profile-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="profile-avatar">
                        {user?.name?.[0] || 'U'}
                    </div>
                    <div className="profile-details">
                        <div className="profile-name">{user?.name || 'Guest'}</div>
                        <div className="profile-role">{user?.role || 'Viewer'}</div>
                    </div>
                    <button
                        onClick={() => {
                            showConfirm('Are you sure you want to log out?', () => {
                                logoutAction();
                            });
                        }}
                        className="logout-btn"
                        title="Sign Out"
                        style={{ marginLeft: '0.5rem' }}
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>
        );
    }

    // Default: full mobile header
    return (
        <header className="app-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <img src="/logo-dark-mode.svg" alt="KSW" style={{ height: '28px', width: 'auto' }} />
            </div>

            <div className="header-profile">
                <div className="profile-info">
                    <div className="profile-avatar">
                        {user?.name?.[0] || 'U'}
                    </div>
                    <div className="profile-details">
                        <div className="profile-name">{user?.name || 'Guest'}</div>
                        <div className="profile-role">{user?.role || 'Viewer'}</div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        showConfirm('Are you sure you want to log out?', () => {
                            logoutAction();
                        });
                    }}
                    className="logout-btn"
                    title="Sign Out"
                >
                    <LogOut size={18} />
                </button>
            </div>
        </header>
    );
}
