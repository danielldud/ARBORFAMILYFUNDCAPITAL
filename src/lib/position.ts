export type PositionProvider = 'coingecko' | 'twelve' | 'yahoo' | 'custom' | 'manual';

export type BuyCalculation = {
    units: number;
    totalCost: number;
    effectiveAverage: number;
};

function finitePositive(value: number) {
    return Number.isFinite(value) && value > 0;
}

export function unitsFromPurchase(totalPaid: number, fee: number, executionPrice: number, provider: PositionProvider): number {
    if (!finitePositive(totalPaid) || !finitePositive(executionPrice) || !Number.isFinite(fee) || fee < 0 || fee >= totalPaid)
        return 0;
    const raw = (totalPaid - fee) / executionPrice;
    // Saham IDX diperdagangkan per lot (100 lembar). Aset lain dapat pecahan.
    if (provider === 'yahoo')
        return Math.floor(raw / 100) * 100;
    return Math.floor(raw * 1e12) / 1e12;
}

export function calculateOpeningBuy(totalPaid: number, fee: number, executionPrice: number, provider: PositionProvider): BuyCalculation {
    const units = unitsFromPurchase(totalPaid, fee, executionPrice, provider);
    return {
        units,
        totalCost: units > 0 ? totalPaid : 0,
        effectiveAverage: units > 0 ? totalPaid / units : 0
    };
}

export function calculateAverageDown(currentUnits: number, currentCost: number, totalPaid: number, fee: number, executionPrice: number, provider: PositionProvider): BuyCalculation {
    if (!finitePositive(currentUnits) || !Number.isFinite(currentCost) || currentCost < 0)
        return { units: 0, totalCost: 0, effectiveAverage: 0 };
    const added = unitsFromPurchase(totalPaid, fee, executionPrice, provider);
    if (!finitePositive(added))
        return { units: currentUnits, totalCost: currentCost, effectiveAverage: currentCost / currentUnits };
    const units = currentUnits + added;
    const totalCost = currentCost + totalPaid;
    return { units, totalCost, effectiveAverage: totalCost / units };
}

export const averageEntry = (units: number, totalCost: number) => finitePositive(units) && Number.isFinite(totalCost) ? totalCost / units : 0;

