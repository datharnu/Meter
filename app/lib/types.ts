export type Attempt = {
  id: string;
  label: string;
  code: string;
  moved: number;
};

export type Meter = {
  id: string;
  buyerName: string;
  vendorName: string;
  buyer: string;
  vendor: string;
  recipient: string;
  amount: number;
  evidence: string;
  deadline: number;
  buyerSigned: boolean;
  vendorSigned: boolean;
  funded: number;
  paid: number;
  refunded: number;
  clock: number;
  attempts: Attempt[];
};
