/** Request types shared by the form (client) and the API (server). */
export const REQUEST_TYPES = {
  access: "Get a summary of my data / a copy",
  correction: "Correct or update my data",
  erasure: "Delete my data / account",
  withdraw_consent: "Withdraw consent",
  nomination: "Nominate someone to act for me",
  grievance: "Complaint about an order or how my data was handled",
  other: "Something else",
} as const;

export type RequestType = keyof typeof REQUEST_TYPES;
