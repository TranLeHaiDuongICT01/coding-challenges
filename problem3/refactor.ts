type Blockchain =
  | 'Osmosis'
  | 'Ethereum'
  | 'Arbitrum'
  | 'Zilliqa'
  | 'Neo';

interface WalletBalance {
  currency: string;
  amount: number;
  blockchain: Blockchain;
}

interface FormattedWalletBalance extends WalletBalance {
  formatted: string;
}

interface Props extends BoxProps {

}

const PRIORITY: Record<Blockchain, number> = {
  Osmosis: 100,
  Ethereum: 50,
  Arbitrum: 30,
  Zilliqa: 20,
  Neo: 20,
};

const WalletPage = (props: Props) => {

  const balances = useWalletBalances();
  const prices = usePrices();

  const formattedBalances = useMemo<FormattedWalletBalance[]>(() => {
    return balances
      .filter((balance) => balance?.amount > 0)
      .filter((balance) => PRIORITY[balance?.blockchain] !== undefined)
      .sort(
        (a, b) =>
          PRIORITY[b?.blockchain] - PRIORITY[a?.blockchain]
      )
      .map((balance) => ({
        ...balance,
        formatted: balance?.amount?.toFixed(4),
      }));
  }, [balances]);

  const rows = formattedBalances.map((balance) => {
        const price = prices?.[balance?.currency];
        const usdValue =
          price != null ? price * balance?.amount : 0;

        return (
          <WalletRow
            key={`${balance?.blockchain}-${balance?.currency}`}
            className={classes.row}
            amount={balance?.amount}
            usdValue={usdValue}
            formattedAmount={balance?.formatted}
          />
        );
      });

  return (
    <div {...props}>
      {rows}
    </div>
  );
};