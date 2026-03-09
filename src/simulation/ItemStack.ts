let nextItemId = 0;

export class ItemStack {
  readonly uid: number;
  readonly resourceId: string;
  quantity: number;

  constructor(resourceId: string, quantity: number = 1) {
    this.uid = nextItemId++;
    this.resourceId = resourceId;
    this.quantity = quantity;
  }

  clone(): ItemStack {
    return new ItemStack(this.resourceId, this.quantity);
  }

  matches(other: ItemStack): boolean {
    return this.resourceId === other.resourceId;
  }
}
