-- New values for Hangouts (used by the next migration). Kept in their own migration because Postgres can't use a
-- newly added enum value in the same transaction that adds it.

-- Hangout venues: places to spend time rather than eat. Partner venues with these categories show on the Hangout
-- map, not on the food map.
alter type public.venue_category add value if not exists 'attraction';
alter type public.venue_category add value if not exists 'park';
alter type public.venue_category add value if not exists 'mall';
alter type public.venue_category add value if not exists 'museum';
alter type public.venue_category add value if not exists 'temple';
alter type public.venue_category add value if not exists 'market';
alter type public.venue_category add value if not exists 'entertainment';

-- ticket: a discount on entry tickets (coupon code; any member of a hangout there can use it, no 3-person rule).
-- free_entry: a listing that entry is free for TableMeet users (no coupon).
-- Both can be ongoing or limited to dates (e.g. a ticket discount for one event).
alter type public.promotion_kind add value if not exists 'ticket';
alter type public.promotion_kind add value if not exists 'free_entry';
