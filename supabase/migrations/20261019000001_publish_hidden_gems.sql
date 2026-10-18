-- Hidden Gems: publish the drafts (founder, 2026-10-19), with pins moved to the addresses found for them.
--
-- * Pins from OpenStreetMap / Photon: Piccolo Vicolo (GalileOasis), W District, Guss Damn Good (no Ari outlet, so its
--   Sala Daeng Soi 1 shop). Pins from published addresses, placed on the right street: The Little Prince Café
--   (180 Suan Phlu Rd), Samrub Samrub Thai (Soi Yommarat, Sala Daeng), Sorn (Sukhumvit 26), EKKA (56 Surawong Rd).
--   Their check_note says the pin is approximate, for the founder to fine-tune in the admin panel.
-- * Still drafts: Old Town White Coffee (no Bangkok branch found), KALM and Wanwan (no address found).

update public.gems g
set lat = c.lat, lng = c.lng
from (values
  ('Piccolo Vicolo Café', 13.751347, 100.526393),
  ('W District, Phra Khanong', 13.714725, 100.593541),
  ('Guss Damn Good', 13.725798, 100.538513),
  ('The Little Prince Café Bangkok', 13.7165, 100.5378),
  ('Samrub Samrub Thai', 13.7288, 100.5384),
  ('Sorn', 13.7273, 100.5701),
  ('EKKA Indian Grill and Bar', 13.7290, 100.5190)
) as c (name_en, lat, lng)
where g.name_en = c.name_en and g.contributor_id is null;

update public.gems g
set description_en = 'A plant-filled vintage café in the GalileOasis creative space, a short walk from Jim Thompson House.',
    description_th = 'คาเฟ่วินเทจเต็มไปด้วยต้นไม้ ในพื้นที่สร้างสรรค์ GalileOasis เดินไปบ้านจิม ทอมป์สันได้',
    hours_en = 'About 9 AM–5 PM, closed on Tuesdays; check before going.',
    hours_th = 'ประมาณ 9:00–17:00 น. ปิดวันอังคาร ตรวจสอบก่อนไป',
    tip_en = 'It''s about 10 minutes'' walk from BTS Ratchathewi; there is also a branch on Khlong Ong Ang.',
    tip_th = 'เดินจาก BTS ราชเทวีประมาณ 10 นาที และมีอีกสาขาริมคลองโอ่งอ่าง'
where g.name_en = 'Piccolo Vicolo Café' and g.contributor_id is null;

update public.gems g
set area_en = 'Silom & Sathorn', area_th = 'สีลมและสาทร',
    hours_en = 'Check the shop''s current hours.', hours_th = 'ตรวจสอบเวลาเปิดล่าสุดของร้าน',
    tip_en = 'The pin is the Sala Daeng Soi 1 shop; there are other outlets around Bangkok.',
    tip_th = 'หมุดคือร้านศาลาแดงซอย 1 มีสาขาอื่นทั่วกรุงเทพฯ'
where g.name_en = 'Guss Damn Good' and g.contributor_id is null;

update public.gems g
set area_en = 'Silom & Sathorn', area_th = 'สีลมและสาทร',
    description_en = 'A colourful café themed on The Little Prince, inside L''Envol Art Space on Suan Phlu Road.',
    description_th = 'คาเฟ่สีสันสดใสธีมเจ้าชายน้อย ในแลงวอล อาร์ต สเปซ ถนนสวนพลู',
    hours_en = 'Closed on Mondays; check current hours.', hours_th = 'ปิดวันจันทร์ ตรวจสอบเวลาล่าสุด',
    tip_en = 'It''s about 12 minutes'' walk from BTS Sala Daeng.', tip_th = 'เดินจาก BTS ศาลาแดงประมาณ 12 นาที'
where g.name_en = 'The Little Prince Café Bangkok' and g.contributor_id is null;

update public.gems g
set area_en = 'Silom & Sathorn', area_th = 'สีลมและสาทร',
    description_en = 'Chef Prin Polsuk''s small counter in a soi off Sala Daeng, serving themed menus of traditional Thai recipes.',
    description_th = 'เคาน์เตอร์เล็กๆ ของเชฟปริญญ์ ผลสุข ในซอยแถวศาลาแดง เสิร์ฟเมนูตามธีมจากตำรับอาหารไทยดั้งเดิม'
where g.name_en = 'Samrub Samrub Thai' and g.contributor_id is null;

update public.gems g
set description_en = 'A coffee roaster in two old shophouses off Song Wat Road, roasting on site with separate espresso and filter bars.',
    description_th = 'โรงคั่วกาแฟในตึกแถวเก่าสองห้องริมถนนทรงวาด คั่วเองในร้าน แยกบาร์เอสเพรสโซและกาแฟดริป',
    hours_en = 'About 9 AM–5 PM on weekdays, to 6 PM at weekends; check before going.',
    hours_th = 'ประมาณ 9:00–17:00 น. วันธรรมดา ถึง 18:00 น. วันหยุด ตรวจสอบก่อนไป',
    tip_en = 'Seats are few and it fills by late morning; it''s a short walk from MRT Wat Mangkon.',
    tip_th = 'ที่นั่งมีน้อย คนเต็มตั้งแต่สายๆ เดินจาก MRT วัดมังกรไม่ไกล'
where g.name_en = 'Song Wat Coffee Roasters' and g.contributor_id is null;

update public.gems g
set hours_en = 'About 11:30 AM–midnight; check before going.', hours_th = 'ประมาณ 11:30–24:00 น. ตรวจสอบก่อนไป'
where g.name_en = 'EKKA Indian Grill and Bar' and g.contributor_id is null;

-- Publish every draft except the three that can't be placed; approximate pins keep a note for the founder.
update public.gems g
set is_published = true,
    check_note = 'Published with an approximate pin: check it on the map and move it if needed.'
where g.contributor_id is null and not g.is_published
  and g.name_en not in ('Old Town White Coffee', 'KALM: Specialty Coffee', 'Wanwan Coffee Roasters')
  and g.name_en not in ('Piccolo Vicolo Café', 'W District, Phra Khanong', 'Guss Damn Good', 'Craftsman Roastery');

update public.gems g
set is_published = true, check_note = null
where g.contributor_id is null and g.name_en in ('Piccolo Vicolo Café', 'W District, Phra Khanong', 'Guss Damn Good', 'Craftsman Roastery');

update public.gems g
set check_note = 'No Bangkok branch found (2026-10-19): confirm one exists before publishing, or delete this gem.'
where g.contributor_id is null and g.name_en = 'Old Town White Coffee';

update public.gems g
set check_note = 'No address found (2026-10-19): find the café and set its pin before publishing.'
where g.contributor_id is null and g.name_en in ('KALM: Specialty Coffee', 'Wanwan Coffee Roasters');
