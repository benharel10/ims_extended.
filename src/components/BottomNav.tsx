'use client'

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, Factory, DollarSign } from 'lucide-react';

export function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { name: 'Dashboard', href: '/', icon: LayoutDashboard },
        { name: 'Inventory', href: '/inventory', icon: Package },
        { name: 'Assembly', href: '/production', icon: Factory },
        { name: 'Sales', href: '/sales', icon: DollarSign },
    ];

    return (
        <nav className="bottom-nav">
            {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <Icon size={24} className={isActive ? 'nav-icon-active' : 'nav-icon'} />
                        <span className="nav-label">{item.name}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
