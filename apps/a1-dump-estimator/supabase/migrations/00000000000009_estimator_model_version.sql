-- Records which snapshot of the estimator's pricing constants
-- (lib/estimator/constants.ts's ESTIMATOR_MODEL_VERSION) priced each
-- estimate. This is what makes "learning data never automatically alters
-- production pricing" an auditable guarantee rather than just a policy: a
-- pricing-defaults change always shows up as a new version on new
-- estimates going forward, never a silent retroactive change to historical
-- ones, and always requires a human to bump the constant in code (an
-- owner-approved, reviewed change), never something the app writes to
-- itself at runtime.

alter table estimates
  add column estimator_model_version text not null default '1.0.0';

create index estimates_model_version_idx on estimates (estimator_model_version);
