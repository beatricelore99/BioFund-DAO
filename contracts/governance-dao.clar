;; Governance DAO Contract for BioFund DAO
;; Clarity v2
;; Manages milestone approval voting and project decisions

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u400)
(define-constant ERR-INVALID-VOTE u401)
(define-constant ERR-VOTING-CLOSED u402)
(define-constant ERR-PAUSED u403)
(define-constant ERR-ZERO-ADDRESS u404)
(define-constant ERR-PROPOSAL-NOT-FOUND u405)
(define-constant ERR-INSUFFICIENT-STAKE u406)
(define-constant ERR-ALREADY-VOTED u407)
(define-constant ERR-INVALID-PROPOSAL-TYPE u408)
(define-constant ERR-INVALID-PROJECT-ID u409)
(define-constant ERR-INVALID-MILESTONE-ID u410)
(define-constant ERR-INVALID-PROPOSAL-ID u411)
(define-constant ERR-INVALID-AMOUNT u412)

;; Proposal types
(define-constant PROPOSAL-MILESTONE-APPROVAL u0)
(define-constant PROPOSAL-PROJECT-CANCELLATION u1)

;; Proposal status
(define-constant STATUS-PENDING u0)
(define-constant STATUS-APPROVED u1)
(define-constant STATUS-REJECTED u2)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var min-stake uint u1000) ;; Minimum stake to vote
(define-data-var voting-period uint u1440) ;; ~10 days at 10 min/block
(define-data-var proposal-counter uint u0)

;; Data structures
(define-map proposals
  { proposal-id: uint }
  {
    project-id: uint,
    milestone-id: (optional uint),
    proposal-type: uint,
    creator: principal,
    created-at: uint,
    deadline: uint,
    yes-votes: uint,
    no-votes: uint,
    status: uint
  }
)

(define-map votes
  { proposal-id: uint, voter: principal }
  { vote: bool, stake: uint }
)

(define-map voter-stakes
  { voter: principal }
  { stake: uint }
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Admin: Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Admin: Pause/unpause contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Admin: Set minimum stake
(define-public (set-min-stake (new-stake uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-stake u0) (err ERR-INVALID-AMOUNT))
    (var-set min-stake new-stake)
    (ok true)
  )
)

;; Admin: Set voting period
(define-public (set-voting-period (new-period uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-period u0) (err ERR-INVALID-AMOUNT))
    (var-set voting-period new-period)
    (ok true)
  )
)

;; Register voter stake
(define-public (register-stake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((current (default-to u0 (get stake (map-get? voter-stakes { voter: tx-sender }))))) 
      (map-set voter-stakes
        { voter: tx-sender }
        { stake: (+ amount current) }
      )
    )
    (ok true)
  )
)

;; Create a new proposal
(define-public (create-proposal (project-id uint) (milestone-id (optional uint)) (proposal-type uint))
  (begin
    (ensure-not-paused)
    (asserts! (> project-id u0) (err ERR-INVALID-PROJECT-ID))
    (asserts! (or (is-eq proposal-type PROPOSAL-MILESTONE-APPROVAL) (is-eq proposal-type PROPOSAL-PROJECT-CANCELLATION)) (err ERR-INVALID-PROPOSAL-TYPE))
    (asserts! (if (is-eq proposal-type PROPOSAL-MILESTONE-APPROVAL) (is-some milestone-id) true) (err ERR-INVALID-MILESTONE-ID))
    (let ((proposal-id (+ (var-get proposal-counter) u1)))
      (map-set proposals
        { proposal-id: proposal-id }
        {
          project-id: project-id,
          milestone-id: milestone-id,
          proposal-type: proposal-type,
          creator: tx-sender,
          created-at: block-height,
          deadline: (+ block-height (var-get voting-period)),
          yes-votes: u0,
          no-votes: u0,
          status: STATUS-PENDING
        }
      )
      (var-set proposal-counter proposal-id)
      (ok proposal-id)
    )
  )
)

;; Vote on a proposal
(define-public (vote (proposal-id uint) (choice bool))
  (begin
    (ensure-not-paused)
    (asserts! (> proposal-id u0) (err ERR-INVALID-PROPOSAL-ID))
    (let ((proposal (unwrap! (map-get? proposals { proposal-id: proposal-id }) (err ERR-PROPOSAL-NOT-FOUND))))
      ;; Voting open check
      (asserts! (is-eq (get status proposal) STATUS-PENDING) (err ERR-VOTING-CLOSED))
      (asserts! (< block-height (get deadline proposal)) (err ERR-VOTING-CLOSED))
      ;; Already voted check
      (asserts! (is-none (map-get? votes { proposal-id: proposal-id, voter: tx-sender })) (err ERR-ALREADY-VOTED))
      ;; Stake check
      (let ((stake (default-to u0 (get stake (map-get? voter-stakes { voter: tx-sender })))))
        (asserts! (>= stake (var-get min-stake)) (err ERR-INSUFFICIENT-STAKE))
        ;; Record vote
        (map-set votes
          { proposal-id: proposal-id, voter: tx-sender }
          { vote: choice, stake: stake }
        )
        ;; Update proposal tallies
        (map-set proposals
          { proposal-id: proposal-id }
          {
            project-id: (get project-id proposal),
            milestone-id: (get milestone-id proposal),
            proposal-type: (get proposal-type proposal),
            creator: (get creator proposal),
            created-at: (get created-at proposal),
            deadline: (get deadline proposal),
            yes-votes: (if choice (+ (get yes-votes proposal) stake) (get yes-votes proposal)),
            no-votes: (if (not choice) (+ (get no-votes proposal) stake) (get no-votes proposal)),
            status: (get status proposal)
          }
        )
      )
      (ok true)
    )
  )
)

;; Finalize a proposal
(define-public (finalize-proposal (proposal-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> proposal-id u0) (err ERR-INVALID-PROPOSAL-ID))
    (let ((proposal (unwrap! (map-get? proposals { proposal-id: proposal-id }) (err ERR-PROPOSAL-NOT-FOUND))))
      ;; Ensure voting closed
      (asserts! (>= block-height (get deadline proposal)) (err ERR-VOTING-CLOSED))
      (asserts! (is-eq (get status proposal) STATUS-PENDING) (err ERR-INVALID-VOTE))
      ;; Set status
      (map-set proposals
        { proposal-id: proposal-id }
        {
          project-id: (get project-id proposal),
          milestone-id: (get milestone-id proposal),
          proposal-type: (get proposal-type proposal),
          creator: (get creator proposal),
          created-at: (get created-at proposal),
          deadline: (get deadline proposal),
          yes-votes: (get yes-votes proposal),
          no-votes: (get no-votes proposal),
          status: (if (> (get yes-votes proposal) (get no-votes proposal))
                    STATUS-APPROVED
                    STATUS-REJECTED)
        }
      )
      (ok true)
    )
  )
)

;; Read-only: Get proposal details
(define-read-only (get-proposal (proposal-id uint))
  (match (map-get? proposals { proposal-id: proposal-id })
    proposal-data (ok proposal-data)
    (err ERR-PROPOSAL-NOT-FOUND)
  )
)

;; Read-only: Get voter stake
(define-read-only (get-voter-stake (voter principal))
  (ok (default-to u0 (get stake (map-get? voter-stakes { voter: voter }))))
)

;; Read-only: Get vote
(define-read-only (get-vote (proposal-id uint) (voter principal))
  (match (map-get? votes { proposal-id: proposal-id, voter: voter })
    vote-data (ok vote-data)
    (err ERR-INVALID-VOTE)
  )
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: Get minimum stake
(define-read-only (get-min-stake)
  (ok (var-get min-stake))
)

;; Read-only: Get voting period
(define-read-only (get-voting-period)
  (ok (var-get voting-period))
)

;; Read-only: Get proposal counter
(define-read-only (get-proposal-counter)
  (ok (var-get proposal-counter))
)
