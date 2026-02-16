# Decimal Quantity Implementation - Complete Guide

## Overview
This migration implements support for fractional quantities (e.g., 0.1, 0.05) using PostgreSQL's DECIMAL(10,3) type for precise decimal arithmetic.

## Database Schema Changes

### Tables Modified:
1. **ItemStock** - `quantity` field
2. **Item** - `minStock`, `currentStock`, and new `uom` field
3. **BOM** - `quantity` field  
4. **ProductionRun** - `quantity` field

### Precision: DECIMAL(10, 3)
- **Total digits**: 10
- **Decimal places**: 3
- **Range**: -9,999,999.999 to 9,999,999.999
- **Examples**: 0.001, 0.1, 1.5, 100.123

## SQL Migration Script

```sql
-- Migration: Add Unit of Measure and Convert to Decimal Quantities
-- Date: 2026-02-16

BEGIN;

-- 1. Add UOM column to Item table
ALTER TABLE "Item" 
ADD COLUMN "uom" TEXT DEFAULT 'Units';

-- 2. Convert ItemStock.quantity to DECIMAL(10,3)
ALTER TABLE "ItemStock" 
ALTER COLUMN "quantity" TYPE DECIMAL(10,3) 
USING "quantity"::DECIMAL(10,3);

ALTER TABLE "ItemStock" 
ALTER COLUMN "quantity" SET DEFAULT 0;

-- 3. Convert Item stock fields to DECIMAL(10,3)
ALTER TABLE "Item" 
ALTER COLUMN "minStock" TYPE DECIMAL(10,3) 
USING "minStock"::DECIMAL(10,3);

ALTER TABLE "Item" 
ALTER COLUMN "minStock" SET DEFAULT 0;

ALTER TABLE "Item" 
ALTER COLUMN "currentStock" TYPE DECIMAL(10,3) 
USING "currentStock"::DECIMAL(10,3);

ALTER TABLE "Item" 
ALTER COLUMN "currentStock" SET DEFAULT 0;

-- 4. Convert BOM.quantity to DECIMAL(10,3)
ALTER TABLE "BOM" 
ALTER COLUMN "quantity" TYPE DECIMAL(10,3) 
USING "quantity"::DECIMAL(10,3);

ALTER TABLE "BOM" 
ALTER COLUMN "quantity" SET DEFAULT 1.0;

-- 5. Convert ProductionRun.quantity to DECIMAL(10,3)
ALTER TABLE "ProductionRun" 
ALTER COLUMN "quantity" TYPE DECIMAL(10,3) 
USING "quantity"::DECIMAL(10,3);

-- 6. Verify changes
SELECT 
    table_name, 
    column_name, 
    data_type,
    numeric_precision,
    numeric_scale
FROM information_schema.columns 
WHERE table_name IN ('Item', 'ItemStock', 'BOM', 'ProductionRun')
AND column_name IN ('quantity', 'minStock', 'currentStock', 'uom');

COMMIT;
```

## Backend Logic: process_production()

### Function Signature:
```typescript
export async function runProduction(
    parentId: number, 
    quantity: number, 
    serialNumbers: string[] = []
)
```

### Implementation Logic:

```typescript
// 1. Fetch BOM for the product
const bom = await prisma.bOM.findMany({
    where: { parentId }
});

// 2. For each component in BOM:
for (const line of bom) {
    // Calculate required amount with DECIMAL precision
    // Required_Amount = BOM.quantity * quantity_produced
    const requiredQty = line.quantity * quantity;
    
    // Fetch component
    const childItem = await prisma.item.findUnique({
        where: { id: line.childId }
    });
    
    // Validate stock availability
    if (childItem.currentStock < requiredQty) {
        throw new Error(
            `Insufficient stock for component ${childItem.sku}. ` +
            `Required: ${requiredQty}, Available: ${childItem.currentStock}`
        );
    }
    
    // Deduct from inventory using Prisma's decrement
    await prisma.item.update({
        where: { id: line.childId },
        data: { 
            currentStock: { 
                decrement: requiredQty 
            } 
        }
    });
}

// 3. Add finished product to inventory
await prisma.item.update({
    where: { id: parentId },
    data: { 
        currentStock: { 
            increment: quantity 
        } 
    }
});

// 4. Create production record
await prisma.productionRun.create({
    data: {
        itemId: parentId,
        quantity: quantity,
        status: 'Completed'
    }
});
```

## UI/UX Implementation

### 1. Inventory Dashboard - Display Format

```typescript
// Display quantities with 2 decimal places
const formattedQuantity = Number(item.currentStock).toFixed(2);

// Example table cell:
<td>{Number(item.currentStock).toFixed(2)} {item.uom}</td>
// Output: "0.15 Liters" or "100.00 Units"
```

### 2. Production Input

```tsx
<input 
    type="number"
    min="0.001"
    step="0.001"
    value={runQuantity}
    onChange={(e) => setRunQuantity(parseFloat(e.target.value) || 0)}
/>
```

### 3. Stock Adjustment Modal

```tsx
<input 
    type="number"
    min="0"
    step="0.01"
    value={quantity}
    onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
/>
```

## Unit of Measure (UOM) Examples

### Common UOM Values:
- **Units** (default) - For countable items (screws, antennas)
- **Liters** - For liquids
- **Grams** - For small weights
- **Kilograms** - For larger weights
- **Meters** - For cables, wires
- **Milliliters** - For small liquid amounts
- **Bottles** - For packaged liquids

### Usage in System:

```typescript
// Creating an item with UOM
await prisma.item.create({
    data: {
        sku: "GLUE-001",
        name: "Industrial Glue",
        uom: "Liters",
        currentStock: 5.75,
        minStock: 1.0
    }
});
```

## Example: Production Calculation

### Scenario:
- **Product**: Antenna Model X
- **Quantity to Produce**: 2.5 units
- **BOM**:
  - Glue: 0.1 Liters per unit
  - Solder: 0.05 Grams per unit
  - PCB: 1 Unit per unit

### Calculation:
```
Required Glue = 0.1 × 2.5 = 0.25 Liters
Required Solder = 0.05 × 2.5 = 0.125 Grams
Required PCB = 1 × 2.5 = 2.5 Units
```

### Database Updates:
```sql
-- Before Production:
Glue: 5.000 Liters
Solder: 10.000 Grams
PCB: 50.000 Units
Antenna X: 10.000 Units

-- After Production:
Glue: 4.750 Liters (5.000 - 0.250)
Solder: 9.875 Grams (10.000 - 0.125)
PCB: 47.500 Units (50.000 - 2.500)
Antenna X: 12.500 Units (10.000 + 2.500)
```

## Prisma Type Handling

### Important: Prisma Decimal Type
Prisma uses the `Decimal` type from the `decimal.js` library for DECIMAL fields.

```typescript
import { Prisma } from '@prisma/client';

// Converting to number for calculations
const quantity = Number(item.currentStock);

// Creating Decimal from number
const decimalQty = new Prisma.Decimal(1.5);

// Comparison (Decimal supports comparison operators)
if (item.currentStock.lessThan(requiredQty)) {
    // Handle insufficient stock
}
```

## Testing Checklist

- [ ] Create item with decimal minStock (e.g., 0.5)
- [ ] Create item with decimal currentStock (e.g., 10.123)
- [ ] Set UOM field (e.g., "Liters")
- [ ] Create BOM with decimal quantity (e.g., 0.1)
- [ ] Run production with decimal quantity (e.g., 1.5)
- [ ] Verify stock calculations are precise
- [ ] Check UI displays 2 decimal places
- [ ] Test with very small decimals (0.001)
- [ ] Verify production history shows decimals
- [ ] Test import/export with decimal values

## Deployment Steps

1. **Database Migration** (Already applied via `npx prisma db push`)
2. **Regenerate Prisma Client** (Already done)
3. **Deploy to Vercel** (In progress)
4. **Verify in Production**:
   - Check database column types
   - Test decimal input
   - Verify calculations

## Rollback Plan

If issues occur, revert using:

```sql
BEGIN;

-- Revert to INTEGER (will round/truncate decimals)
ALTER TABLE "ItemStock" ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;
ALTER TABLE "Item" ALTER COLUMN "minStock" TYPE INTEGER USING ROUND("minStock")::INTEGER;
ALTER TABLE "Item" ALTER COLUMN "currentStock" TYPE INTEGER USING ROUND("currentStock")::INTEGER;
ALTER TABLE "BOM" ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;
ALTER TABLE "ProductionRun" ALTER COLUMN "quantity" TYPE INTEGER USING ROUND("quantity")::INTEGER;

-- Remove UOM column
ALTER TABLE "Item" DROP COLUMN "uom";

COMMIT;
```

## Notes

- **Precision**: DECIMAL guarantees exact precision (unlike FLOAT/DOUBLE)
- **Performance**: DECIMAL is slightly slower than native types but ensures accuracy
- **Display**: Always use `.toFixed(2)` or `.toFixed(3)` for consistent UI formatting
- **Validation**: Enforce minimum step of 0.001 in frontend inputs
