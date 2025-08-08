;; Crowdfunding Contract for BioFund DAO
;; Clarity v2
;; Manages project funding, contributions, and refunds

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-PROJECT-NOT-FOUND u201)
(define-constant ERR-INVALID-AMOUNT u202)
(define-constant ERR-PAUSED u203)
(define-constant ERR-ZERO-ADDRESS u204)
(define-constant ERR-FUNDING-CLOSED u205)
(define-constant ERR-FUNDING-GOAL-MET u206)
(define-constant ERR-FUNDING-NOT-MET u207)
(define-constant ERR-INVALID-DEADLINE u208)
(define-constant ERR-ALREADY-FUNDED u209)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)

;; Data structures
(define-map projects
  { project-id: uint }
  {
    funding-goal: uint, ;; in micro-STX
    total-funded: uint,
    deadline: uint, ;; block height
    creator: principal,
    funded: bool
  }
)

(define-map contributions
  { project-id: uint, contributor: principal }
  { amount: uint }
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: check if funding is open
(define-private (is-funding-open (project-id uint))
  (match (map-get? projects { project-id: project-id })
    project
    (and (not (get funded project)) (< block-height (get deadline project)))
    false
  )
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

;; Create a new crowdfunding project
(define-public (create-project (project-id uint) (funding-goal uint) (deadline uint))
  (begin
    (ensure-not-paused)
    (asserts! (> funding-goal u0) (err ERR-INVALID-AMOUNT))
    (asserts! (> deadline block-height) (err ERR-INVALID-DEADLINE))
    (asserts! (is-none (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (map-set projects
      { project-id: project-id }
      {
        funding-goal: funding-goal,
        total-funded: u0,
        deadline: deadline,
        creator: tx-sender,
        funded: false
      }
    )
    (ok true)
  )
)

;; Contribute to a project
(define-public (contribute (project-id uint) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (is-funding-open project-id) (err ERR-FUNDING-CLOSED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (let
      (
        (project (unwrap-panic (map-get? projects { project-id: project-id })))
        (new-total (+ (get total-funded project) amount))
      )
      (map-set contributions
        { project-id: project-id, contributor: tx-sender }
        { amount: (+ amount (default-to u0 (map-get? contributions { project-id: project-id, contributor: tx-sender }))) }
      )
      (map-set projects
        { project-id: project-id }
        (merge project { total-funded: new-total })
      )
      (if (>= new-total (get funding-goal project))
        (map-set projects
          { project-id: project-id }
          (merge project { funded: true })
        )
        false
      )
      (ok true)
    )
  )
)

;; Admin: Release funds to project creator
(define-public (release-funds (project-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (let ((project (unwrap-panic (map-get? projects { project-id: project-id }))))
      (asserts! (get funded project) (err ERR-FUNDING-NOT-MET))
      (asserts! (>= (get total-funded project) (get funding-goal project)) (err ERR-FUNDING-NOT-MET))
      (try! (as-contract (stx-transfer? (get total-funded project) tx-sender (get creator project))))
      (ok true)
    )
  )
)

;; Refund contributors if funding goal not met
(define-public (refund (project-id uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (let ((project (unwrap-panic (map-get? projects { project-id: project-id }))))
      (asserts! (> block-height (get deadline project)) (err ERR-FUNDING-CLOSED))
      (asserts! (not (get funded project)) (err ERR-ALREADY-FUNDED))
      (asserts! (< (get total-funded project) (get funding-goal project)) (err ERR-FUNDING-GOAL-MET))
      (let
        (
          (contributor-amount (default-to u0 (map-get? contributions { project-id: project-id, contributor: tx-sender })))
        )
        (asserts! (> contributor-amount u0) (err ERR-INVALID-AMOUNT))
        (try! (as-contract (stx-transfer? contributor-amount tx-sender tx-sender)))
        (map-delete contributions { project-id: project-id, contributor: tx-sender })
        (ok true)
      )
    )
  )
)

;; Read-only: Get project details
(define-read-only (get-project (project-id uint))
  (match (map-get? projects { project-id: project-id })
    project-data (ok project-data)
    (err ERR-PROJECT-NOT-FOUND)
  )
)

;; Read-only: Get contribution amount
(define-read-only (get-contribution (project-id uint) (contributor principal))
  (ok (default-to u0 (map-get? contributions { project-id: project-id, contributor: contributor })))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: Check if funding is open
(define-read-only (is-funding-open-read (project-id uint))
  (ok (is-funding-open project-id))
)