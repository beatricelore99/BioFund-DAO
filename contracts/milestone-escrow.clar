;; Milestone Escrow Contract for BioFund DAO
;; Clarity v2
;; Manages milestone-based fund escrow and release

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-PROJECT-NOT-FOUND u301)
(define-constant ERR-MILESTONE-NOT-FOUND u302)
(define-constant ERR-INVALID-AMOUNT u303)
(define-constant ERR-PAUSED u304)
(define-constant ERR-ZERO-ADDRESS u305)
(define-constant ERR-MILESTONE-NOT-PENDING u306)
(define-constant ERR-INSUFFICIENT-FUNDS u307)
(define-constant ERR-ALREADY-APPROVED u308)

;; Milestone status enum
(define-constant STATUS-PENDING u0)
(define-constant STATUS-APPROVED u1)
(define-constant STATUS-REJECTED u2)

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)

;; Data structures
(define-map projects
  { project-id: uint }
  { creator: principal, total-escrowed: uint }
)

(define-map milestones
  { project-id: uint, milestone-id: uint }
  {
    amount: uint, ;; in micro-STX
    description: (string-utf8 500),
    status: uint,
    submitted-at: uint,
    approver: (optional principal)
  }
)

(define-map escrow-balances
  { project-id: uint, milestone-id: uint }
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

;; Private helper: validate description
(define-private (validate-description (text (string-utf8 500)))
  (and (> (len text) u0) (<= (len text) u500))
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

;; Create a new project
(define-public (create-project (project-id uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-none (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (map-set projects
      { project-id: project-id }
      { creator: tx-sender, total-escrowed: u0 }
    )
    (ok true)
  )
)

;; Add a milestone to a project
(define-public (add-milestone (project-id uint) (milestone-id uint) (amount uint) (description (string-utf8 500)))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (is-none (map-get? milestones { project-id: project-id, milestone-id: milestone-id })) (err ERR-MILESTONE-NOT-FOUND))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (validate-description description) (err ERR-INVALID-AMOUNT))
    (map-set milestones
      { project-id: project-id, milestone-id: milestone-id }
      {
        amount: amount,
        description: description,
        status: STATUS-PENDING,
        submitted-at: block-height,
        approver: none
      }
    )
    (ok true)
  )
)

;; Fund a milestone
(define-public (fund-milestone (project-id uint) (milestone-id uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (is-some (map-get? milestones { project-id: project-id, milestone-id: milestone-id })) (err ERR-MILESTONE-NOT-FOUND))
    (let
      (
        (milestone (unwrap-panic (map-get? milestones { project-id: project-id, milestone-id: milestone-id })))
        (project (unwrap-panic (map-get? projects { project-id: project-id })))
      )
      (asserts! (is-eq (get status milestone) STATUS-PENDING) (err ERR-MILESTONE-NOT-PENDING))
      (try! (stx-transfer? (get amount milestone) tx-sender (as-contract tx-sender)))
      (map-set escrow-balances
        { project-id: project-id, milestone-id: milestone-id }
        { amount: (+ (get amount milestone) (default-to u0 (map-get? escrow-balances { project-id: project-id, milestone-id: milestone-id }))) }
      )
      (map-set projects
        { project-id: project-id }
        (merge project { total-escrowed: (+ (get total-escrowed project) (get amount milestone)) })
      )
      (ok true)
    )
  )
)

;; Approve a milestone (governance/admin)
(define-public (approve-milestone (project-id uint) (milestone-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (is-some (map-get? milestones { project-id: project-id, milestone-id: milestone-id })) (err ERR-MILESTONE-NOT-FOUND))
    (let
      (
        (milestone (unwrap-panic (map-get? milestones { project-id: project-id, milestone-id: milestone-id })))
        (project (unwrap-panic (map-get? projects { project-id: project-id })))
        (escrow-amount (default-to u0 (map-get? escrow-balances { project-id: project-id, milestone-id: milestone-id })))
      )
      (asserts! (is-eq (get status milestone) STATUS-PENDING) (err ERR-MILESTONE-NOT-PENDING))
      (asserts! (>= escrow-amount (get amount milestone)) (err ERR-INSUFFICIENT-FUNDS))
      (try! (as-contract (stx-transfer? (get amount milestone) tx-sender (get creator project))))
      (map-set milestones
        { project-id: project-id, milestone-id: milestone-id }
        (merge milestone { status: STATUS-APPROVED, approver: (some tx-sender) })
      )
      (map-set projects
        { project-id: project-id }
        (merge project { total-escrowed: (- (get total-escrowed project) (get amount milestone)) })
      )
      (map-delete escrow-balances { project-id: project-id, milestone-id: milestone-id })
      (ok true)
    )
  )
)

;; Reject a milestone (governance/admin)
(define-public (reject-milestone (project-id uint) (milestone-id uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (is-some (map-get? milestones { project-id: project-id, milestone-id: milestone-id })) (err ERR-MILESTONE-NOT-FOUND))
    (let
      (
        (milestone (unwrap-panic (map-get? milestones { project-id: project-id, milestone-id: milestone-id })))
        (project (unwrap-panic (map-get? projects { project-id: project-id })))
        (escrow-amount (default-to u0 (map-get? escrow-balances { project-id: project-id, milestone-id: milestone-id })))
      )
      (asserts! (is-eq (get status milestone) STATUS-PENDING) (err ERR-MILESTONE-NOT-PENDING))
      (map-set milestones
        { project-id: project-id, milestone-id: milestone-id }
        (merge milestone { status: STATUS-REJECTED, approver: (some tx-sender) })
      )
      (map-set projects
        { project-id: project-id }
        (merge project { total-escrowed: (- (get total-escrowed project) escrow-amount) })
      )
      (map-delete escrow-balances { project-id: project-id, milestone-id: milestone-id })
      (ok true)
    )
  )
)

;; Refund escrowed funds for rejected milestone
(define-public (refund-milestone (project-id uint) (milestone-id uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (is-some (map-get? milestones { project-id: project-id, milestone-id: milestone-id })) (err ERR-MILESTONE-NOT-FOUND))
    (let
      (
        (milestone (unwrap-panic (map-get? milestones { project-id: project-id, milestone-id: milestone-id })))
        (escrow-amount (default-to u0 (map-get? escrow-balances { project-id: project-id, milestone-id: milestone-id })))
      )
      (asserts! (is-eq (get status milestone) STATUS-REJECTED) (err ERR-MILESTONE-NOT-PENDING))
      (asserts! (> escrow-amount u0) (err ERR-INSUFFICIENT-FUNDS))
      (try! (as-contract (stx-transfer? escrow-amount tx-sender tx-sender)))
      (map-set projects
        { project-id: project-id }
        (merge (unwrap-panic (map-get? projects { project-id: project-id })) { total-escrowed: (- (get total-escrowed (unwrap-panic (map-get? projects { project-id: project-id }))) escrow-amount) })
      )
      (map-delete escrow-balances { project-id: project-id, milestone-id: milestone-id })
      (ok true)
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

;; Read-only: Get milestone details
(define-read-only (get-milestone (project-id uint) (milestone-id uint))
  (match (map-get? milestones { project-id: project-id, milestone-id: milestone-id })
    milestone-data (ok milestone-data)
    (err ERR-MILESTONE-NOT-FOUND)
  )
)

;; Read-only: Get escrow balance
(define-read-only (get-escrow-balance (project-id uint) (milestone-id uint))
  (ok (default-to u0 (map-get? escrow-balances { project-id: project-id, milestone-id: milestone-id })))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)