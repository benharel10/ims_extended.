
// Mock iCount Integration Service

export type ICountResponse = {
    success: boolean;
    icountId?: number;
    message?: string;
};

export async function createInvoiceInICount(orderData: any): Promise<ICountResponse> {
    console.log('--- iCount Sync Start ---');
    console.log('Creating Invoice for Order:', orderData.soNumber);
    console.log('Customer:', orderData.customer);

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate randomness
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
        const icountId = Math.floor(Math.random() * 10000) + 1000;
        console.log('Success! Created iCount Invoice ID:', icountId);
        console.log('--- iCount Sync End ---');
        return { success: true, icountId };
    } else {
        console.error('Failed to create invoice in iCount');
        console.log('--- iCount Sync End ---');
        return { success: false, message: 'Connection timeout' };
    }
}
