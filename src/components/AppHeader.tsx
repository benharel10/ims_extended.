'use client'

import React from 'react';
import { useSystem } from '@/components/SystemProvider';
import { LogOut, Search } from 'lucide-react';
import { logoutAction } from '../app/auth/actions';

export function AppHeader() {
    const { user, showConfirm } = useSystem();

    return (
        <header className="app-header">
            <div className="header-search">
                <Search size={18} className="search-icon" />
                <input type="text" placeholder="Global Search..." className="search-input" />
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
