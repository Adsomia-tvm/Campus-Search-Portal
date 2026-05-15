-- LEAD-02: Sales pipeline stage expansion
-- ===========================================================================
-- Replaces the old 7-stage list (New / Contacted / Visited / Applied /
-- Enrolled / Dropped / Junk) with a 10-stage edtech sales pipeline:
--
--   New → Attempted (called, no answer)
--       → Connected (spoke to lead)
--       → Counselling Done (career test / detailed counsel)
--       → Visited (campus visit)
--       → Applied (application submitted)
--       → Enrolled (fees paid — Won)
--   Side buckets: Follow-up (nurture / future batch), Dropped (Lost), Junk
--
-- Only existing label that changes meaning is "Contacted" — the new flow
-- splits it into "Attempted" (tried to call) and "Connected" (spoke to
-- them). Existing "Contacted" rows are mapped to "Connected" on the
-- assumption that they were logged after a real conversation; if any rows
-- should actually be "Attempted", they can be re-classified manually.
--
-- All other labels (New, Visited, Applied, Enrolled, Dropped, Junk) carry
-- forward unchanged.

UPDATE "enquiries"
   SET "status" = 'Connected'
 WHERE "status" = 'Contacted';
