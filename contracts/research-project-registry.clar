;; Research Project Registry Contract for BioFund DAO
;; Clarity v2
;; Manages project registration, token issuance, and project status

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-PROJECT-ID u101)
(define-constant ERR-PROJECT-EXISTS u102)
(define-constant ERR-PROJECT-NOT-FOUND u103)
(define-constant ERR-INVALID-NAME u104)
(define-constant ERR-INVALID-DESCRIPTION u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-PAUSED u107)
(define-constant ERR-ZERO-ADDRESS u108)
(define-constant ERR-INVALID-STATUS u109)

;; Project status enum
(define-constant STATUS-PENDING u0)
(define-constant STATUS-ACTIVE u1)
(define-constant STATUS-CANCELLED u2)
(define-constant STATUS-COMPLETED u3)

;; Token metadata constants
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-TOKEN-SUPPLY u1000000000000) ;; 1M tokens per project

;; Contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var project-counter uint u0)

;; Data structures
(define-map projects
  { project-id: uint }
  {
    name: (string-ascii 100),
    description: (string-utf8 500),
    creator: principal,
    status: uint,
    created-at: uint,
    token-supply: uint
  }
)

(define-map project-tokens
  { project-id: uint, holder: principal }
  { balance: uint }
)

(define-map project-token-total-supply
  { project-id: uint }
  { total-supply: uint }
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate string inputs
(define-private (validate-string (text (string-ascii 100)))
  (and (> (len text) u0) (<= (len text) u100))
)

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

;; Register a new project
(define-public (register-project (name (string-ascii 100)) (description (string-utf8 500)) (initial-token-supply uint))
  (begin
    (ensure-not-paused)
    (asserts! (validate-string name) (err ERR-INVALID-NAME))
    (asserts! (validate-description description) (err ERR-INVALID-DESCRIPTION))
    (asserts! (> initial-token-supply u0) (err ERR-INVALID-AMOUNT))
    (asserts! (<= initial-token-supply MAX-TOKEN-SUPPLY) (err ERR-INVALID-AMOUNT))
    (let ((project-id (+ (var-get project-counter) u1)))
      (asserts! (is-none (map-get? projects { project-id: project-id })) (err ERR-PROJECT-EXISTS))
      (map-set projects
        { project-id: project-id }
        {
          name: name,
          description: description,
          creator: tx-sender,
          status: STATUS-PENDING,
          created-at: block-height,
          token-supply: initial-token-supply
        }
      )
      (map-set project-token-total-supply
        { project-id: project-id }
        { total-supply: initial-token-supply }
      )
      (map-set project-tokens
        { project-id: project-id, holder: tx-sender }
        { balance: initial-token-supply }
      )
      (var-set project-counter project-id)
      (ok project-id)
    )
  )
)

;; Update project status (admin only)
(define-public (update-project-status (project-id uint) (new-status uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (or
                (is-eq new-status STATUS-PENDING)
                (is-eq new-status STATUS-ACTIVE)
                (is-eq new-status STATUS-CANCELLED)
                (is-eq new-status STATUS-COMPLETED))
              (err ERR-INVALID-STATUS))
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (map-set projects
      { project-id: project-id }
      (merge
        (unwrap-panic (map-get? projects { project-id: project-id }))
        { status: new-status }
      )
    )
    (ok true)
  )
)

;; Transfer project tokens
(define-public (transfer-tokens (project-id uint) (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((sender-balance (default-to u0 (map-get? project-tokens { project-id: project-id, holder: tx-sender }))))
      (asserts! (>= sender-balance amount) (err ERR-INVALID-AMOUNT))
      (map-set project-tokens
        { project-id: project-id, holder: tx-sender }
        { balance: (- sender-balance amount) }
      )
      (map-set project-tokens
        { project-id: project-id, holder: recipient }
        { balance: (+ amount (default-to u0 (map-get? project-tokens { project-id: project-id, holder: recipient }))) }
      )
      (ok true)
    )
  )
)

;; Admin: Mint additional tokens for a project
(define-public (mint-tokens (project-id uint) (recipient principal) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? projects { project-id: project-id })) (err ERR-PROJECT-NOT-FOUND))
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((current-supply (default-to u0 (map-get? project-token-total-supply { project-id: project-id }))))
      (asserts! (<= (+ current-supply amount) MAX-TOKEN-SUPPLY) (err ERR-INVALID-AMOUNT))
      (map-set project-token-total-supply
        { project-id: project-id }
        { total-supply: (+ current-supply amount) }
      )
      (map-set project-tokens
        { project-id: project-id, holder: recipient }
        { balance: (+ amount (default-to u0 (map-get? project-tokens { project-id: project-id, holder: recipient }))) }
      )
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

;; Read-only: Get token balance
(define-read-only (get-token-balance (project-id uint) (holder principal))
  (ok (default-to u0 (map-get? project-tokens { project-id: project-id, holder: holder })))
)

;; Read-only: Get total token supply for a project
(define-read-only (get-project-token-supply (project-id uint))
  (ok (default-to u0 (map-get? project-token-total-supply { project-id: project-id })))
)

;; Read-only: Get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: Check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: Get project counter
(define-read-only (get-project-counter)
  (ok (var-get project-counter))
)