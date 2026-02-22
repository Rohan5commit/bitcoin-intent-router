(use-trait sip010-ft-trait .sip010-trait.sip010-ft-trait)

(define-constant STATUS-OPEN u0)
(define-constant STATUS-FILLED u1)
(define-constant STATUS-CANCELED u2)
(define-constant STATUS-EXPIRED u3)

(define-constant INTENT-SWAP u0)
(define-constant INTENT-YIELD u1)

(define-constant BPS-DENOMINATOR u10000)
(define-constant MAX-PAGE-SIZE u10)

(define-constant ERR-UNAUTHORIZED u100)
(define-constant ERR-INVALID-INTENT-TYPE u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-DEADLINE u103)
(define-constant ERR-INVALID-FEE u104)
(define-constant ERR-INTENT-NOT-FOUND u105)
(define-constant ERR-NOT-CREATOR u106)
(define-constant ERR-INTENT-NOT-OPEN u107)
(define-constant ERR-INTENT-EXPIRED u108)
(define-constant ERR-MIN-OUT-NOT-MET u109)
(define-constant ERR-TOKEN-MISMATCH u110)
(define-constant ERR-PRICE-NOT-SET u111)
(define-constant ERR-BAD-PAGE-SIZE u112)
(define-constant ERR-BAD-PRICE u113)

(define-data-var next-intent-id uint u1)
(define-data-var intent-count uint u0)
(define-data-var admin principal tx-sender)

(define-map intent-index
  { index: uint }
  { id: uint }
)

(define-map internal-prices
  {
    token-in: principal,
    token-out: principal
  }
  {
    numerator: uint,
    denominator: uint
  }
)

(define-map intents
  { id: uint }
  {
    creator: principal,
    intent-type: uint,
    token-in: principal,
    token-out: principal,
    amount-in: uint,
    min-amount-out: uint,
    deadline: uint,
    solver-fee-bps: uint,
    status: uint,
    amount-out: uint,
    solver: (optional principal),
    created-at: uint
  }
)

(define-private (derive-status (stored-status uint) (deadline uint))
  (if (and (is-eq stored-status STATUS-OPEN) (> block-height deadline))
    STATUS-EXPIRED
    stored-status
  )
)

(define-private (load-intent-or-fail (id uint))
  (unwrap! (map-get? intents { id: id }) (err ERR-INTENT-NOT-FOUND))
)

(define-public (set-admin (next-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (var-set admin next-admin)
    (ok next-admin)
  )
)

(define-public (set-internal-price
  (token-in principal)
  (token-out principal)
  (numerator uint)
  (denominator uint)
)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR-UNAUTHORIZED))
    (asserts! (> numerator u0) (err ERR-BAD-PRICE))
    (asserts! (> denominator u0) (err ERR-BAD-PRICE))
    (map-set internal-prices
      {
        token-in: token-in,
        token-out: token-out
      }
      {
        numerator: numerator,
        denominator: denominator
      }
    )
    (ok true)
  )
)

(define-public (create-intent
  (intent-type uint)
  (token-in <sip010-ft-trait>)
  (token-out <sip010-ft-trait>)
  (amount-in uint)
  (min-amount-out uint)
  (deadline uint)
  (solver-fee-bps uint)
)
  (let
    (
      (token-in-principal (contract-of token-in))
      (token-out-principal (contract-of token-out))
      (intent-id (var-get next-intent-id))
      (index (var-get intent-count))
    )
    (asserts!
      (or (is-eq intent-type INTENT-SWAP) (is-eq intent-type INTENT-YIELD))
      (err ERR-INVALID-INTENT-TYPE)
    )
    (asserts! (> amount-in u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> min-amount-out u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> deadline block-height) (err ERR-INVALID-DEADLINE))
    (asserts! (<= solver-fee-bps BPS-DENOMINATOR) (err ERR-INVALID-FEE))

    (try! (contract-call? token-in transfer amount-in tx-sender (as-contract tx-sender) none))

    (map-set intents
      { id: intent-id }
      {
        creator: tx-sender,
        intent-type: intent-type,
        token-in: token-in-principal,
        token-out: token-out-principal,
        amount-in: amount-in,
        min-amount-out: min-amount-out,
        deadline: deadline,
        solver-fee-bps: solver-fee-bps,
        status: STATUS-OPEN,
        amount-out: u0,
        solver: none,
        created-at: block-height
      }
    )

    (map-set intent-index { index: index } { id: intent-id })

    (var-set next-intent-id (+ intent-id u1))
    (var-set intent-count (+ index u1))

    (ok intent-id)
  )
)

(define-public (cancel-intent (id uint) (token-in <sip010-ft-trait>))
  (let
    (
      (intent (try! (load-intent-or-fail id)))
      (current-status (derive-status (get status intent) (get deadline intent)))
    )
    (asserts! (is-eq (get token-in intent) (contract-of token-in)) (err ERR-TOKEN-MISMATCH))
    (asserts! (is-eq tx-sender (get creator intent)) (err ERR-NOT-CREATOR))

    (if (is-eq current-status STATUS-EXPIRED)
      (begin
        (map-set intents { id: id } (merge intent { status: STATUS-EXPIRED }))
        (err ERR-INTENT-EXPIRED)
      )
      (begin
        (asserts! (is-eq current-status STATUS-OPEN) (err ERR-INTENT-NOT-OPEN))

        (try! (as-contract (contract-call? token-in transfer (get amount-in intent) tx-sender (get creator intent) none)))

        (map-set intents { id: id } (merge intent { status: STATUS-CANCELED }))
        (ok true)
      )
    )
  )
)

(define-public (fill-intent
  (id uint)
  (path-data
    (tuple
      (quoted-amount-out uint)
      (route-id (string-ascii 64))
    )
  )
  (token-in <sip010-ft-trait>)
  (token-out <sip010-ft-trait>)
)
  (let
    (
      (intent (try! (load-intent-or-fail id)))
      (current-status (derive-status (get status intent) (get deadline intent)))
      (solver tx-sender)
      (price (unwrap! (map-get? internal-prices
        {
          token-in: (get token-in intent),
          token-out: (get token-out intent)
        }
      ) (err ERR-PRICE-NOT-SET)))
      (simulated-amount-out (/ (* (get amount-in intent) (get numerator price)) (get denominator price)))
      (solver-fee (/ (* simulated-amount-out (get solver-fee-bps intent)) BPS-DENOMINATOR))
      (creator-amount-out (- simulated-amount-out solver-fee))
    )
    (asserts! (is-eq (get token-in intent) (contract-of token-in)) (err ERR-TOKEN-MISMATCH))
    (asserts! (is-eq (get token-out intent) (contract-of token-out)) (err ERR-TOKEN-MISMATCH))

    (if (is-eq current-status STATUS-EXPIRED)
      (begin
        (map-set intents { id: id } (merge intent { status: STATUS-EXPIRED }))
        (err ERR-INTENT-EXPIRED)
      )
      (begin
        (asserts! (is-eq current-status STATUS-OPEN) (err ERR-INTENT-NOT-OPEN))
        (asserts! (>= simulated-amount-out (get min-amount-out intent)) (err ERR-MIN-OUT-NOT-MET))

        ; solver escrows output token into router for deterministic settlement
        (try! (contract-call? token-out transfer simulated-amount-out tx-sender (as-contract tx-sender) none))

        (if (> creator-amount-out u0)
          (try! (as-contract (contract-call? token-out transfer creator-amount-out tx-sender (get creator intent) none)))
          true
        )

        (if (> solver-fee u0)
          (try! (as-contract (contract-call? token-out transfer solver-fee tx-sender solver none)))
          true
        )

        ; solver receives maker's input token after successful settlement
        (try! (as-contract (contract-call? token-in transfer (get amount-in intent) tx-sender solver none)))

        (map-set intents
          { id: id }
          (merge intent {
            status: STATUS-FILLED,
            amount-out: simulated-amount-out,
            solver: (some solver)
          })
        )

        (print {
          event: "intent-filled",
          intent-id: id,
          solver: solver,
          route-id: (get route-id path-data),
          quoted-amount-out: (get quoted-amount-out path-data),
          amount-out: simulated-amount-out
        })

        (ok simulated-amount-out)
      )
    )
  )
)

(define-read-only (get-intent (id uint))
  (match (map-get? intents { id: id })
    intent
    (some (merge (merge intent { status: (derive-status (get status intent) (get deadline intent)) }) { id: id }))
    none
  )
)

(define-read-only (get-intent-count)
  (var-get intent-count)
)

(define-read-only (fetch-intent-at (idx uint))
  (match (map-get? intent-index { index: idx })
    row (get-intent (get id row))
    none
  )
)

(define-read-only (list-intents (offset uint) (limit uint))
  (let ((safe-limit (if (> limit MAX-PAGE-SIZE) MAX-PAGE-SIZE limit)))
    (asserts! (> safe-limit u0) (err ERR-BAD-PAGE-SIZE))
    (ok (list
      (if (> safe-limit u0) (fetch-intent-at offset) none)
      (if (> safe-limit u1) (fetch-intent-at (+ offset u1)) none)
      (if (> safe-limit u2) (fetch-intent-at (+ offset u2)) none)
      (if (> safe-limit u3) (fetch-intent-at (+ offset u3)) none)
      (if (> safe-limit u4) (fetch-intent-at (+ offset u4)) none)
      (if (> safe-limit u5) (fetch-intent-at (+ offset u5)) none)
      (if (> safe-limit u6) (fetch-intent-at (+ offset u6)) none)
      (if (> safe-limit u7) (fetch-intent-at (+ offset u7)) none)
      (if (> safe-limit u8) (fetch-intent-at (+ offset u8)) none)
      (if (> safe-limit u9) (fetch-intent-at (+ offset u9)) none)
    ))
  )
)
