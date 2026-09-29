export type InstallmentRow = {
  month: number;
  principal: number;
  interest: number;
  payment: number;
  balance: number;
};

export type InstallmentResult = {
  loanAmount: number;
  downPayment: number;
  monthlyPayment: number;
  totalInterest: number;
  rows: InstallmentRow[];
};

export function calculateInstallment(price: number, loanAmount: number, months: number, annualRate: number): InstallmentResult | null {
  if (![price, loanAmount, months, annualRate].every(Number.isFinite) || price <= 0 || loanAmount <= 0 ||
    loanAmount > price || !Number.isInteger(months) || months <= 0 || annualRate < 0 || annualRate > 100) return null;

  const principal = Math.round(loanAmount);
  const monthlyRate = annualRate / 1200;
  const monthlyPayment = Math.round(monthlyRate === 0
    ? principal / months
    : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
  let balance = principal;
  let totalInterest = 0;
  const rows: InstallmentRow[] = [];

  for (let month = 1; month <= months; month++) {
    const interest = Math.round(balance * monthlyRate);
    const paidPrincipal = month === months ? balance : Math.min(balance, Math.max(0, monthlyPayment - interest));
    balance -= paidPrincipal;
    totalInterest += interest;
    rows.push({ month, principal: paidPrincipal, interest, payment: paidPrincipal + interest, balance });
  }

  return { loanAmount: principal, downPayment: Math.round(price) - principal, monthlyPayment, totalInterest, rows };
}
