/**
 * Shared Zod schemas for Server Action input validation.
 * Import these in your actions to parse and validate incoming data before hitting the DB.
 */
import { z } from 'zod';

// ─── Auth ───────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
    email: z.string().trim().toLowerCase().email('Must be a valid email address').max(254),
    password: z.string().min(1, 'Password is required').max(128),
});

// ─── Inventory ───────────────────────────────────────────────────────────────

const ITEM_TYPES = ['Raw', 'Assembly', 'Product', 'Raw Material'] as const;

export const CreateItemSchema = z.object({
    sku: z.string().trim().min(1, 'SKU is required').max(50, 'SKU must be 50 characters or fewer').regex(/^[^<>]*$/, 'SKU cannot contain < or >'),
    name: z.string().trim().min(1, 'Item name is required').max(200),
    type: z.enum(ITEM_TYPES, { errorMap: () => ({ message: 'Invalid item type' }) }),
    cost: z.number().min(0, 'Cost cannot be negative'),
    price: z.number().min(0, 'Price cannot be negative'),
    minStock: z.number().min(0, 'Min stock cannot be negative'),
    revision: z.string().max(50).optional(),
    warehouse: z.string().max(100).optional(),
    brand: z.string().max(100).optional(),
    isSerialized: z.boolean().optional(),
    description: z.string().max(2000).optional(),
    icountId: z.number().int().positive().optional(),
    inspectionTemplateUrl: z.string().nullable().optional(),
    inspectionTemplateName: z.string().max(200).nullable().optional(),
});

export const UpdateItemSchema = CreateItemSchema.extend({
    version: z.number().int().min(0).optional(),
});

export const UpdateStockSchema = z.object({
    quantity: z.number().min(0, 'Stock quantity cannot be negative'),
    warehouseId: z.number().int().positive().optional(),
});

// ─── Sales ───────────────────────────────────────────────────────────────────

const SALES_STATUSES = ['Draft', 'Confirmed', 'Shipped', 'Completed', 'Cancelled'] as const;

export const CreateSalesOrderSchema = z.object({
    customer: z.string().trim().min(1, 'Customer name is required').max(200),
    soNumber: z.string().trim().min(1, 'SO number is required').max(100),
    productionRunId: z.number().int().positive().optional(),
    itemId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().optional(),
});

export const LinkSalesOrderSchema = z.object({
    id: z.number().int().positive(),
    itemId: z.number().int().positive().nullable().optional(),
    quantity: z.number().int().positive().nullable().optional(),
    productionRunId: z.number().int().positive().nullable().optional(),
});

export const AddSalesLineSchema = z.object({
    soId: z.number().int().positive(),
    itemId: z.number().int().positive(),
    quantity: z.number().positive('Quantity must be positive'),
    unitPrice: z.number().min(0, 'Unit price cannot be negative'),
});

export const UpdateSalesStatusSchema = z.object({
    id: z.number().int().positive(),
    status: z.enum(SALES_STATUSES, { errorMap: () => ({ message: 'Invalid status value' }) }),
});

// ─── Purchasing ───────────────────────────────────────────────────────────────

const PO_STATUSES = ['Draft', 'Sent', 'Partial', 'Completed', 'Cancelled'] as const;

export const CreatePOSchema = z.object({
    supplier: z.string().trim().min(1, 'Supplier name is required').max(200),
    leadTimeDays: z.number().int().min(0).optional(),
    shippingCost: z.number().min(0).optional(),
    salesOrderId: z.number().int().positive().optional(),
    orderDate: z.string().optional(),
    dueDate: z.string().optional(),
});

export const AddPOLineSchema = z.object({
    poId: z.number().int().positive(),
    quantity: z.number().positive('Quantity must be positive'),
    cost: z.number().min(0, 'Unit cost cannot be negative'),
    itemId: z.number().int().positive().optional(),
    newItemName: z.string().trim().max(200).optional(),
    newItemSku: z.string().trim().max(50).optional(),
}).refine(d => d.itemId || d.newItemName, { message: 'Item ID or new item name is required' });

export const UpdatePOStatusSchema = z.object({
    id: z.number().int().positive(),
    status: z.enum(PO_STATUSES, { errorMap: () => ({ message: 'Invalid status value' }) }),
});

export const UpdatePONumberSchema = z.object({
    id: z.number().int().positive(),
    poNumber: z.string().trim().min(1, 'PO number is required').max(100),
});

// ─── Shipping ─────────────────────────────────────────────────────────────────

const SHIP_TYPES = ['Outbound', 'Inbound', 'Transfer'] as const;
const SHIP_STATUSES = ['Draft', 'Packed', 'Shipped', 'Delivered', 'Completed', 'Cancelled'] as const;
const WH_TYPES = ['Standard', 'Virtual', 'Retail'] as const;

export const CreateShipmentSchema = z.object({
    shipmentNo: z.string().trim().min(1, 'Shipment number is required').max(100),
    soId: z.number().int().positive().optional(),
    carrier: z.string().trim().max(100).optional(),
    trackingNo: z.string().trim().max(100).optional(),
    type: z.enum(SHIP_TYPES).optional(),
    fromWarehouseId: z.number().int().positive().optional(),
    toWarehouseId: z.number().int().positive().optional(),
}).refine(d => {
    if (d.type === 'Transfer') return d.fromWarehouseId && d.toWarehouseId;
    return true;
}, { message: 'Transfer requires both source and destination warehouses' }).refine(d => {
    if (d.type === 'Transfer') return d.fromWarehouseId !== d.toWarehouseId;
    return true;
}, { message: 'Source and destination warehouses must be different' });

export const CreateWarehouseSchema = z.object({
    name: z.string().trim().min(1, 'Warehouse name is required').max(80, 'Warehouse name must be 80 characters or fewer'),
    location: z.string().trim().max(200).optional(),
    type: z.enum(WH_TYPES).optional(),
});

export const UpdateShipmentStatusSchema = z.object({
    id: z.number().int().positive(),
    status: z.enum(SHIP_STATUSES, { errorMap: () => ({ message: 'Invalid status value' }) }),
});

// ─── Production ───────────────────────────────────────────────────────────────

export const RunProductionSchema = z.object({
    parentId: z.number().int().positive(),
    quantity: z.number().positive('Quantity must be a positive number').finite(),
    serialNumbers: z.array(z.string().trim().min(1)).optional(),
    toWarehouseId: z.number().int().positive('Destination warehouse is required'),
});

export const SaveBOMSchema = z.object({
    parentId: z.number().int().positive(),
    components: z.array(z.object({
        childId: z.number().int().positive(),
        quantity: z.number().positive('All component quantities must be positive'),
    })).min(0),
    itemUpdates: z.object({
        cost: z.number().min(0, 'Cost cannot be negative').optional(),
        price: z.number().min(0, 'Price cannot be negative').optional(),
    }).optional(),
});

// ─── Helper: parse and return a server-action-friendly error ──────────────────

/**
 * Parses a Zod schema against incoming data.
 * Returns { success: true, data } or { success: false, error: string }.
 */
export function parseSchema<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);
    if (!result.success) {
        const first = result.error.errors[0];
        return { success: false, error: first?.message ?? 'Invalid input' };
    }
    return { success: true, data: result.data };
}
