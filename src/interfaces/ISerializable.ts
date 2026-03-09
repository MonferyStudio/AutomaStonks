export interface ISerializable<T = unknown> {
  serialize(): T;
  deserialize(data: T): void;
}
