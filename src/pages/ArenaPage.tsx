import { useState } from 'react'
import { Gavel, Trophy } from 'lucide-react'
import { auctions as demoAuctions, currency, getNextAuctionBid } from '../data'
import type { Auction, AuctionProgress } from '../types'
import TrustFooter from '../components/TrustFooter'
import Modal from '../components/Modal'
import DemoNotice from '../components/DemoNotice'

export default function ArenaPage({ notify, balance, placeBid, auctionProgress, auctions = demoAuctions, backendMode = false }: {
  notify: (message: string) => void
  balance: number
  placeBid: (auction: Auction, amount: number) => {
    result: 'success' | 'insufficient-balance' | 'closed' | 'invalid-bid'
    winner: string | null
  } | Promise<{
    result: 'success' | 'insufficient-balance' | 'closed' | 'invalid-bid'
    winner: string | null
  }>
  auctionProgress: Record<string, AuctionProgress>
  auctions?: Auction[]
  backendMode?: boolean
}) {
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null)
  const [bidSubmitting, setBidSubmitting] = useState(false)
  const progressByAuction = auctionProgress
  const recentWinner = auctions
    .map((auction) => ({ auction, progress: progressByAuction[auction.id] }))
    .filter((item): item is { auction: Auction; progress: AuctionProgress } => Boolean(item.progress?.winner))
    .sort((left, right) => (right.progress.completedAt ?? 0) - (left.progress.completedAt ?? 0))[0]

  return (
    <div className="page-content arena-page">
      <div className="arena-sticky-header">
        <section className="rank-card">
          <div className="rank-details">
            <div className="rank-label"><Trophy size={20} /> <span>Your Rank</span></div>
            <div className="rank-number">{backendMode ? '—' : '#127'}</div>
            <div className="rank-caption">{backendMode ? 'Rank data unavailable' : 'Top 15% this month'}</div>
          </div>
          <div className="recent-winner">
            <span className="winner-label"><Trophy size={15} /> Recent Winner</span>
            <strong>{recentWinner?.progress.winner ?? (backendMode ? 'No winner yet' : 'S. Chen')}</strong>
            <span>{recentWinner ? `won ${recentWinner.auction.title}` : backendMode ? 'Winners will appear here' : 'won Premium Headphones'}</span>
          </div>
        </section>
        <h2 className="active-auctions-title">Active Auctions</h2>
      </div>
      <section className="auction-section">
        <div className="auction-list">
          {auctions.map((auction) => (
            <article className="auction-card" key={auction.id} style={{ backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.72), rgba(0,0,0,.20)), url("${auction.image}")` }}>
              {(() => {
                const progress = progressByAuction[auction.id] ?? { entries: [], winner: null, round: 0 }
                const bidCount = Math.min(progress.entryCount ?? progress.entries.length, auction.bidTarget)
                const isComplete = bidCount >= auction.bidTarget
                const bidAmount = progress.nextAmount ?? getNextAuctionBid(auction, progress.entries, progress.round)
                return (
                  <div className="auction-progress">
                    <div className="auction-progress-label">
                      <span>{isComplete ? 'Auction complete' : 'Bids placed'}</span>
                      <strong>{bidCount} / {auction.bidTarget}</strong>
                    </div>
                    <div className="auction-progress-track" role="progressbar" aria-label={`${auction.title} bid progress`} aria-valuemin={0} aria-valuemax={auction.bidTarget} aria-valuenow={bidCount}>
                      <span style={{ width: `${bidCount / auction.bidTarget * 100}%` }} />
                    </div>
                    <span className="auction-entry-price">
                      {auction.itemValue !== undefined ? 'Next entry: ' : 'Next bid: '}
                      {currency(bidAmount)}
                    </span>
                    {auction.itemValue !== undefined && <span className="auction-entry-price">Estimated prize value: {currency(auction.itemValue)}</span>}
                    {progress.winner && <span className="auction-winner">Last winner: {progress.winner}</span>}
                  </div>
                )
              })()}
              <div className="auction-copy">
                <span className="auction-kicker">Bid and stand a chance to win</span>
                <h3>{auction.title}</h3>
                <div className="auction-leader"><span>{(progressByAuction[auction.id]?.entryCount ?? progressByAuction[auction.id]?.entries.length ?? 0) ? 'Leading Bidder' : 'Bidding'}</span><strong>{progressByAuction[auction.id]?.entries.slice(-1)[0]?.bidder ?? auction.bidder}</strong></div>
              </div>
              <button className="auction-bid-button" type="button" disabled={(progressByAuction[auction.id]?.entryCount ?? progressByAuction[auction.id]?.entries.length ?? 0) >= auction.bidTarget} onClick={() => setSelectedAuction(auction)}>
                <Gavel size={16} /> {(progressByAuction[auction.id]?.entryCount ?? progressByAuction[auction.id]?.entries.length ?? 0) >= auction.bidTarget ? 'Round complete' : `Place Bid ${currency(progressByAuction[auction.id]?.nextAmount ?? getNextAuctionBid(auction, progressByAuction[auction.id]?.entries ?? [], progressByAuction[auction.id]?.round ?? 0))}`}
              </button>
            </article>
          ))}
        </div>
      </section>
      <TrustFooter />

      {selectedAuction && (
        <Modal title="Place a bid" onClose={() => setSelectedAuction(null)}>
          <div className="bid-product">
            <img src={selectedAuction.image} alt="" />
            <div><span>Active auction</span><strong>{selectedAuction.title}</strong></div>
          </div>
          {selectedAuction.itemValue === undefined && (
            <div className="bid-summary"><span>Current leading bid</span><strong>{currency(progressByAuction[selectedAuction.id]?.lastAmount ?? progressByAuction[selectedAuction.id]?.entries.slice(-1)[0]?.amount ?? selectedAuction.bid)}</strong></div>
          )}
          {selectedAuction.itemValue !== undefined && (
            <>
              <div className="bid-summary"><span>Estimated prize value</span><strong>{currency(selectedAuction.itemValue)}</strong></div>
              <div className="bid-summary"><span>Total contributed</span><strong>{currency(progressByAuction[selectedAuction.id]?.totalAmount ?? (progressByAuction[selectedAuction.id]?.entries ?? []).reduce((total, entry) => total + entry.amount, 0))}</strong></div>
            </>
          )}
          <div className="bid-summary next-bid">
            <span>{selectedAuction.itemValue === undefined ? 'Your minimum bid' : 'Your entry amount'}</span>
            <strong>{currency(progressByAuction[selectedAuction.id]?.nextAmount ?? getNextAuctionBid(selectedAuction, progressByAuction[selectedAuction.id]?.entries ?? [], progressByAuction[selectedAuction.id]?.round ?? 0))}</strong>
          </div>
          <div className="bid-summary"><span>Bid entries</span><strong>{progressByAuction[selectedAuction.id]?.entryCount ?? progressByAuction[selectedAuction.id]?.entries.length ?? 0} / {selectedAuction.bidTarget}</strong></div>
          <div className="bid-summary"><span>Available Balance</span><strong>{currency(balance)}</strong></div>
          <DemoNotice>
            {selectedAuction.itemValue !== undefined
              ? 'Demo auction only. Each randomly varied entry is below KSh 200. When all entries are placed, a winner is drawn, shown in Recent Winner, and a new round begins.'
              : 'Demo auction only. Confirming deducts the minimum bid from your demo account balance.'}
          </DemoNotice>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setSelectedAuction(null)}>Cancel</button>
            <button className="primary-button" type="button" disabled={bidSubmitting || (progressByAuction[selectedAuction.id]?.nextAmount ?? getNextAuctionBid(selectedAuction, progressByAuction[selectedAuction.id]?.entries ?? [], progressByAuction[selectedAuction.id]?.round ?? 0)) > balance || (progressByAuction[selectedAuction.id]?.entryCount ?? progressByAuction[selectedAuction.id]?.entries.length ?? 0) >= selectedAuction.bidTarget} onClick={async () => {
              const nextBidAmount = progressByAuction[selectedAuction.id]?.nextAmount ?? getNextAuctionBid(selectedAuction, progressByAuction[selectedAuction.id]?.entries ?? [], progressByAuction[selectedAuction.id]?.round ?? 0)
              setBidSubmitting(true)
              try {
                const result = await placeBid(selectedAuction, nextBidAmount)
                setSelectedAuction(null)
                notify(result.result === 'success'
                  ? result.winner
                    ? `${result.winner} won ${selectedAuction.title}. The next round is now open.`
                    : `${currency(nextBidAmount)} deducted and your bid entry added.`
                  : result.result === 'closed'
                    ? 'This auction is already closed.'
                    : result.result === 'invalid-bid'
                      ? 'The bid amount could not be validated. Please try again.'
                      : 'Insufficient account balance for this bid.')
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Your bid could not be recorded. Please try again.')
              } finally {
                setBidSubmitting(false)
              }
            }}>{bidSubmitting ? 'Processing…' : `Bid ${currency(progressByAuction[selectedAuction.id]?.nextAmount ?? getNextAuctionBid(selectedAuction, progressByAuction[selectedAuction.id]?.entries ?? [], progressByAuction[selectedAuction.id]?.round ?? 0))}`}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
