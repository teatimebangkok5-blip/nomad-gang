-- Bangkok rail network for the day planner's "BTS / MRT" travel times: BTS Sukhumvit, Silom and Gold lines, MRT
-- Blue, Purple, Yellow and Pink lines, the Airport Rail Link and the SRT Dark Red line. Stations and their order on
-- each line from OpenStreetMap (ODbL); one direction per line (the planner counts stops both ways). The Silom
-- line's order is written out because its OpenStreetMap route lists only a few stops.

insert into public.transit_stations (osm_type, osm_id, name, name_en, name_th, lat, lng) values
('node', 257066779, 'Surasak', 'Surasak', 'สุรศักดิ์', 13.7192683, 100.5214619),
('node', 257066790, 'Chong Nonsi', 'Chong Nonsi', 'ช่องนนทรี', 13.7237969, 100.5293250),
('node', 257066809, 'Ratchadamri', 'Ratchadamri', 'ราชดำริ', 13.7394708, 100.5394496),
('node', 257067085, 'Saphan Taksin', 'Saphan Taksin', 'สะพานตากสิน', 13.7188128, 100.5142230),
('node', 280179404, 'Hua Lamphong', 'Hua Lamphong', 'หัวลำโพง', 13.7375708, 100.5171350),
('node', 280179427, 'Phra Ram 9', 'Phra Ram 9', 'พระราม 9', 13.7578166, 100.5652774),
('node', 280179448, 'Queen Sirikit National Convention Centre', 'Queen Sirikit National Convention Centre', 'ศูนย์การประชุมแห่งชาติสิริกิติ์', 13.7226725, 100.5599134),
('node', 280222462, 'Lumphini', 'Lumphini', 'ลุมพินี', 13.7256066, 100.5457249),
('node', 280239009, 'Huai Khwang', 'Huai Khwang', 'ห้วยขวาง', 13.7786878, 100.5735662),
('node', 280239362, 'Sutthisan', 'Sutthisan', 'สุทธิสาร', 13.7894884, 100.5740801),
('node', 280239363, 'Ratchadaphisek', 'Ratchadaphisek', 'รัชดาภิเษก', 13.7989706, 100.5745537),
('node', 280240574, 'Thailand Cultural Centre', 'Thailand Cultural Centre', 'ศูนย์วัฒนธรรมแห่งประเทศไทย', 13.7661576, 100.5701188),
('node', 280240577, 'Lat Phrao', 'Lat Phrao', 'ลาดพร้าว', 13.8065030, 100.5728701),
('node', 280240580, 'Phahon Yothin', 'Phahon Yothin', 'พหลโยธิน', 13.8128808, 100.5614634),
('node', 280240585, 'Chatuchak Park', 'Chatuchak Park', 'สวนจตุจักร', 13.8029643, 100.5532845),
('node', 280240589, 'Kamphaeng Phet', 'Kamphaeng Phet', 'กำแพงเพชร', 13.7979484, 100.5478837),
('node', 280729450, 'Khlong Toei', 'Khlong Toei', 'คลองเตย', 13.7221264, 100.5543696),
('node', 305693940, 'Pho Nimit', 'Pho Nimit', 'โพธิ์นิมิตร', 13.7192426, 100.4859681),
('node', 340133002, 'Talat Phlu', 'Talat Phlu', 'ตลาดพลู', 13.7142201, 100.4766912),
('node', 443815142, 'Wongwian Yai', 'Wongwian Yai', 'วงเวียนใหญ่', 13.7210816, 100.4951594),
('node', 443815144, 'Krung Thon Buri', 'Krung Thon Buri', 'กรุงธนบุรี', 13.7209307, 100.5027176),
('node', 451697335, 'Sala Daeng', 'Sala Daeng', 'ศาลาแดง', 13.7285677, 100.5343416),
('node', 970112998, 'Hua Mak', 'Hua Mak', 'หัวหมาก', 13.7380166, 100.6452618),
('node', 1113055052, 'Wutthakat', 'Wutthakat', 'วุฒากาศ', 13.7130228, 100.4689032),
('node', 1285516977, 'Saphan Khwai', 'Saphan Khwai', 'สะพานควาย', 13.7938228, 100.5497114),
('node', 1692209237, 'Siam', 'Siam', 'สยาม', 13.7456236, 100.5342199),
('node', 2094758805, 'Tha Phra', 'Tha Phra', 'ท่าพระ', 13.7296466, 100.4740422),
('node', 2094758837, 'Bang Khun Non', 'Bang Khun Non', 'บางขุนนนท์', 13.7633253, 100.4732959),
('node', 3801037850, 'Charan 13', 'Charan 13', 'จรัญฯ 13', 13.7401714, 100.4707092),
('node', 3801037852, 'Bang Phlat', 'Bang Phlat', 'บางพลัด', 13.7924113, 100.5048882),
('node', 3801037853, 'Bang Yi Khan', 'Bang Yi Khan', 'บางยี่ขัน', 13.7773820, 100.4852556),
('node', 3801037855, 'Bang O', 'Bang O', 'บางอ้อ', 13.7989803, 100.5097864),
('node', 3801037856, 'Bang Khae', 'Bang Khae', 'บางแค', 13.7119437, 100.4223368),
('node', 3801040557, 'Bang Pho', 'Bang Pho', 'บางโพ', 13.8064027, 100.5210095),
('node', 3801040558, 'Bang Phai', 'Bang Phai', 'บางไผ่', 13.7246179, 100.4650788),
('node', 3801040559, 'Phasi Charoen', 'Phasi Charoen', 'ภาษีเจริญ', 13.7129105, 100.4343260),
('node', 3801040561, 'Lak Song', 'Lak Song', 'หลักสอง', 13.7108774, 100.4094849),
('node', 3801040564, 'Phetkasem 48', 'Phetkasem 48', 'เพชรเกษม 48', 13.7155591, 100.4454508),
('node', 3805378261, 'Wat Phra Sri Mahathat', 'Wat Phra Sri Mahathat', 'วัดพระศรีมหาธาตุ', 13.8752766, 100.5967316),
('node', 5222817654, 'Yaek Tiwanon', 'Yaek Tiwanon', 'แยกติวานนท์', 13.8395295, 100.5149681),
('node', 5222817655, 'Wong Sawang', 'Wong Sawang', 'วงศ์สว่าง', 13.8298636, 100.5264960),
('node', 5222817656, 'Bang Son', 'Bang Son', 'บางซ่อน', 13.8200810, 100.5324581),
('node', 5222843674, 'Khlong Bang Phai', 'Khlong Bang Phai', 'คลองบางไผ่', 13.8924338, 100.4082161),
('node', 5222843675, 'Talad Bang Yai', 'Talad Bang Yai', 'ตลาดบางใหญ่', 13.8810117, 100.4092870),
('node', 5222843676, 'Sam Yaek Bang Yai', 'Sam Yaek Bang Yai', 'สามแยกบางใหญ่', 13.8746749, 100.4193624),
('node', 5222843677, 'Bang Phlu', 'Bang Phlu', 'บางพลู', 13.8757677, 100.4338011),
('node', 5222843678, 'Bang Rak Yai', 'Bang Rak Yai', 'บางรักใหญ่', 13.8766070, 100.4449359),
('node', 5222843679, 'Bang Rak Noi Tha It', 'Bang Rak Noi Tha It', 'บางรักน้อยท่าอิฐ', 13.8748084, 100.4559653),
('node', 5222843680, 'Sai Ma', 'Sai Ma', 'ไทรม้า', 13.8705112, 100.4666922),
('node', 5222843681, 'Phra Nang Klao Bridge', 'Phra Nang Klao Bridge', 'สะพานพระนั่งเกล้า', 13.8702897, 100.4801284),
('node', 5222843682, 'Yaek Nonthaburi 1', 'Yaek Nonthaburi 1', 'แยกนนทบุรี 1', 13.8659610, 100.4940765),
('node', 5222843683, 'Bang Krasor', 'Bang Krasor', 'บางกระสอ', 13.8616527, 100.5046524),
('node', 5222843684, 'Nonthaburi Civic Center', 'Nonthaburi Civic Center', 'ศูนย์ราชการนนทบุรี', 13.8601736, 100.5130671),
('node', 5222843685, 'Ministry of Public Health', 'Ministry of Public Health', 'กระทรวงสาธารณสุข', 13.8485312, 100.5147152),
('node', 5388599065, 'Mo Chit', 'Mo Chit', 'หมอชิต', 13.8025991, 100.5537913),
('node', 5388607091, 'Ari', 'Ari', 'อารีย์', 13.7797077, 100.5446201),
('node', 5388610344, 'Phaya Thai', 'Phaya Thai', 'พญาไท', 13.7569644, 100.5338214),
('node', 5388611982, 'Ratchathewi', 'Ratchathewi', 'ราชเทวี', 13.7518605, 100.5315534),
('node', 5388638318, 'Sanam Pao', 'Sanam Pao', 'สนามเป้า', 13.7726225, 100.5420729),
('node', 5391599348, 'Bearing', 'Bearing', 'แบริ่ง', 13.6611846, 100.6018056),
('node', 5391610964, 'Bang Na', 'Bang Na', 'บางนา', 13.6681380, 100.6046633),
('node', 5391610985, 'Phra Khanong', 'Phra Khanong', 'พระโขนง', 13.7151693, 100.5912365),
('node', 5391611863, 'Victory Monument', 'Victory Monument', 'อนุสาวรีย์ชัยสมรภูมิ', 13.7627589, 100.5370529),
('node', 5391613497, 'Udom Suk', 'Udom Suk', 'อุดมสุข', 13.6798746, 100.6094698),
('node', 5391616767, 'Punnawithi', 'Punnawithi', 'ปุณณวิถี', 13.6892790, 100.6089963),
('node', 5391618414, 'Bang Chak', 'Bang Chak', 'บางจาก', 13.6967594, 100.6053402),
('node', 5391620400, 'On Nut', 'On Nut', 'อ่อนนุช', 13.7056249, 100.6010040),
('node', 5391625873, 'Asok', 'Asok', 'อโศก', 13.7370432, 100.5603571),
('node', 5391626092, 'Thong Lo', 'Thong Lo', 'ทองหล่อ', 13.7242264, 100.5785054),
('node', 5391626093, 'Phrom Phong', 'Phrom Phong', 'พร้อมพงษ์', 13.7304345, 100.5697129),
('node', 5391628766, 'Nana', 'Nana', 'นานา', 13.7405358, 100.5554291),
('node', 5391631777, 'Phloen Chit', 'Phloen Chit', 'เพลินจิต', 13.7430684, 100.5489762),
('node', 5391636575, 'Chit Lom', 'Chit Lom', 'ชิดลม', 13.7440974, 100.5430684),
('node', 5391659126, 'Samrong', 'Samrong', 'สำโรง', 13.6464875, 100.5957857),
('node', 5391691787, 'Sukhumvit', 'Sukhumvit', 'สุขุมวิท', 13.7374671, 100.5614980),
('node', 5405616025, 'Ekkamai', 'Ekkamai', 'เอกมัย', 13.7195385, 100.5851110),
('node', 5812248586, 'Charoen Nakhon', 'Charoen Nakhon', 'เจริญนคร', 13.7264621, 100.5090694),
('node', 5812248587, 'Khlong San', 'Khlong San', 'คลองสาน', 13.7303066, 100.5077213),
('node', 6024782068, 'Rangsit', 'Rangsit', 'รังสิต', 13.9905416, 100.6021544),
('node', 6124793513, 'Pu Chao', 'Pu Chao', 'ปู่เจ้า', 13.6372768, 100.5920064),
('node', 6124793514, 'Chang Erawan', 'Chang Erawan', 'ช้างเอราวัณ', 13.6215944, 100.5901599),
('node', 6124793515, 'Royal Thai Naval Academy', 'Royal Thai Naval Academy', 'โรงเรียนนายเรือ', 13.6084089, 100.5949057),
('node', 6124793516, 'Pak Nam', 'Pak Nam', 'ปากน้ำ', 13.6021243, 100.5970924),
('node', 6124793517, 'Srinagarindra', 'Srinagarindra', 'ศรีนครินทร์', 13.5919965, 100.6090352),
('node', 6124793521, 'Phraek Sa', 'Phraek Sa', 'แพรกษา', 13.5841917, 100.6079050),
('node', 6124793522, 'Sai Luat', 'Sai Luat', 'สายลวด', 13.5777755, 100.6054607),
('node', 6124793523, 'Kheha', 'Kheha', 'เคหะฯ', 13.5676866, 100.6076939),
('node', 6563228219, 'Sirindhorn', 'Sirindhorn', 'สิรินธร', 13.7838726, 100.4933267),
('node', 6681609012, 'Yaek Kor Por Aor', 'Yaek Kor Por Aor', 'แยก คปอ.', 13.9250126, 100.6258374),
('node', 6681609016, 'Royal Thai Air Force Museum', 'Royal Thai Air Force Museum', 'พิพิธภัณฑ์กองทัพอากาศ', 13.9179713, 100.6216910),
('node', 6681609017, 'Bhumibol Adulyadej Hospital', 'Bhumibol Adulyadej Hospital', 'โรงพยาบาลภูมิพลอดุลยเดช', 13.9107140, 100.6173961),
('node', 6681609018, 'Saphan Mai', 'Saphan Mai', 'สะพานใหม่', 13.8966129, 100.6090774),
('node', 6681609019, 'Sai Yud', 'Sai Yud', 'สายหยุด', 13.8884510, 100.6042685),
('node', 6681609020, 'Phahonyothin 59', 'Phahonyothin 59', 'พหลโยธิน 59', 13.8824483, 100.6007312),
('node', 6681609024, '11th Infantry Regiment', '11th Infantry Regiment', 'กรมทหารราบที่ 11', 13.8675784, 100.5919727),
('node', 6681609025, 'Bang Bua', 'Bang Bua', 'บางบัว', 13.8560490, 100.5851786),
('node', 6681609026, 'Royal Forest Department', 'Royal Forest Department', 'กรมป่าไม้', 13.8503260, 100.5818158),
('node', 6681609027, 'Kasetsart University', 'Kasetsart University', 'มหาวิทยาลัยเกษตรศาสตร์', 13.8423141, 100.5771050),
('node', 6681609028, 'Sena Nikhom', 'Sena Nikhom', 'เสนานิคม', 13.8364057, 100.5736286),
('node', 6681609029, 'Ratchayothin', 'Ratchayothin', 'รัชโยธิน', 13.8297477, 100.5697222),
('node', 6681609030, 'Phahonyothin 24', 'Phahonyothin 24', 'พหลโยธิน 24', 13.8241206, 100.5664253),
('node', 6711003839, 'Suvarnabhumi', 'Suvarnabhumi', 'สุวรรณภูมิ', 13.6942952, 100.7512954),
('node', 6711009224, 'Ramkhamhaeng', 'Ramkhamhaeng', 'รามคำแหง', 13.7429933, 100.6001541),
('node', 6711014684, 'Ban Thap Chang', 'Ban Thap Chang', 'บ้านทับช้าง', 13.7328881, 100.6908166),
('node', 6711016582, 'Lat Krabang', 'Lat Krabang', 'ลาดกระบัง', 13.7276817, 100.7485985),
('node', 6711023184, 'Makkasan', 'Makkasan', 'มักกะสัน', 13.7509089, 100.5611427),
('node', 6711026524, 'Ratchaprarop', 'Ratchaprarop', 'ราชปรารภ', 13.7551065, 100.5421238),
('node', 6711028526, 'Phaya Thai', 'Phaya Thai', 'พญาไท', 13.7567100, 100.5349074),
('node', 6966466946, 'Ha Yaek Lat Phrao', 'Ha Yaek Lat Phrao', 'ห้าแยกลาดพร้าว', 13.8166807, 100.5620359),
('node', 7096345624, 'Fai Chai', 'Fai Chai', 'ไฟฉาย', 13.7558013, 100.4693198),
('node', 7769639096, 'Bang Wa', 'Bang Wa', 'บางหว้า', 13.7207900, 100.4577913),
('node', 7769639097, 'Bang Wa', 'Bang Wa', 'บางหว้า', 13.7202698, 100.4570233),
('node', 7769639098, 'Tao Poon', 'Tao Poon', 'เตาปูน', 13.8061627, 100.5307752),
('node', 7781158247, 'Saint Louis', 'Saint Louis', 'เซนต์หลุยส์', 13.7208160, 100.5266863),
('node', 7781303392, 'Samrong', 'Samrong', 'สำโรง', 13.6450158, 100.5966038),
('node', 7787093471, 'Chatuchak', 'Chatuchak', 'จตุจักร', 13.8266181, 100.5494741),
('node', 7787093472, 'Wat Samian Nari', 'Wat Samian Nari', 'วัดเสมียนนารี', 13.8415934, 100.5574987),
('node', 7787093474, 'Bang Khen', 'Bang Khen', 'บางเขน', 13.8493659, 100.5616724),
('node', 7787093475, 'Thung Song Hong', 'Thung Song Hong', 'ทุ่งสองห้อง', 13.8602057, 100.5675309),
('node', 7787093476, 'Lak Si', 'Lak Si', 'หลักสี่', 13.8863144, 100.5819360),
('node', 7787093477, 'Kan Kheha', 'Kan Kheha', 'การเคหะ', 13.8986570, 100.5888732),
('node', 7787093478, 'Don Muang', 'Don Muang', 'ดอนเมือง', 13.9146880, 100.5978685),
('node', 7787093479, 'Lak Hok (Rangsit U.)', 'Lak Hok (Rangsit U.)', 'หลักหก (ม.รังสิต)', 13.9657233, 100.6053753),
('node', 7947551369, 'Krung Thon Buri', 'Krung Thon Buri', 'กรุงธนบุรี', 13.7211055, 100.5037147),
('node', 8214007176, 'Khu Khot', 'Khu Khot', 'คูคต', 13.9323658, 100.6465227),
('node', 8717933838, 'Lat Phrao', 'Lat Phrao', 'ลาดพร้าว', 13.8069826, 100.5747847),
('node', 8986366369, 'Krung Thep Aphiwat', 'Krung Thep Aphiwat', 'กรุงเทพอภิวัฒน์', 13.8040313, 100.5417111),
('node', 9734008618, 'Thipphawan', 'Thipphawan', 'ทิพวัล', 13.6367271, 100.6098956),
('node', 9734008619, 'Si Thepha', 'Si Thepha', 'ศรีเทพา', 13.6298427, 100.6226880),
('node', 10830450760, 'Si Dan', 'Si Dan', 'ศรีด่าน', 13.6331023, 100.6301104),
('node', 10830450761, 'Si Bearing', 'Si Bearing', 'ศรีแบริ่ง', 13.6434906, 100.6362735),
('node', 10830450762, 'Si La Salle', 'Si La Salle', 'ศรีลาซาล', 13.6549747, 100.6421608),
('node', 10830450763, 'Si Iam', 'Si Iam', 'ศรีเอี่ยม', 13.6676858, 100.6450683),
('node', 10867419321, 'Srinagarindra 38', 'Srinagarindra 38', 'ศรีนครินทร์ 38', 13.7011219, 100.6464727),
('node', 10867419322, 'Si Nut', 'Si Nut', 'ศรีนุช', 13.7110971, 100.6441957),
('node', 10867419323, 'Kalantan', 'Kalantan', 'กลันตัน', 13.7252705, 100.6417798),
('node', 10867419325, 'Si Kritha', 'Si Kritha', 'ศรีกรีฑา', 13.7504111, 100.6447881),
('node', 10867419326, 'Yaek Lam Sali', 'Yaek Lam Sali', 'แยกลำสาลี', 13.7618191, 100.6455722),
('node', 10867419327, 'Bang Kapi', 'Bang Kapi', 'บางกะปิ', 13.7690755, 100.6397685),
('node', 10867419328, 'Lat Phrao 101', 'Lat Phrao 101', 'ลาดพร้าว 101', 13.7746334, 100.6298421),
('node', 10867419329, 'Mahatthai', 'Mahatthai', 'มหาดไทย', 13.7783677, 100.6231602),
('node', 10867419330, 'Phawana', 'Phawana', 'ภาวนา', 13.8001638, 100.5841952),
('node', 10867419331, 'Chok Chai 4', 'Chok Chai 4', 'โชคชัย 4', 13.7944253, 100.5944302),
('node', 10867419332, 'Lat Phrao 71', 'Lat Phrao 71', 'ลาดพร้าว 71', 13.7870921, 100.6075731),
('node', 10867419333, 'Lat Phrao 83', 'Lat Phrao 83', 'ลาดพร้าว 83', 13.7837002, 100.6136576),
('node', 11364308559, 'Nonthaburi Civic Center', 'Nonthaburi Civic Center', 'ศูนย์ราชการนนทบุรี', 13.8597221, 100.5181159),
('node', 11364361871, 'Khae Rai', 'Khae Rai', 'แคราย', 13.8626592, 100.5206536),
('node', 11364361876, 'Sanambin Nam', 'Sanambin Nam', 'สนามบินน้ำ', 13.8741356, 100.5163213),
('node', 11364361877, 'Yaek Pak Kret', 'Yaek Pak Kret', 'แยกปากเกร็ด', 13.9061990, 100.5053950),
('node', 11364361878, 'Samakkhi', 'Samakkhi', 'สามัคคี', 13.8892782, 100.5105744),
('node', 11364361879, 'Royal Irrigation Department', 'Royal Irrigation Department', 'กรมชลประทาน', 13.8985658, 100.5070888),
('node', 11364361880, 'Pak Kret Bypass', 'Pak Kret Bypass', 'เลี่ยงเมืองปากเกร็ด', 13.9064956, 100.5155770),
('node', 11364361882, 'Chaeng Watthana-Pak Kret 28', 'Chaeng Watthana-Pak Kret 28', 'แจ้งวัฒนะ-ปากเกร็ด 28', 13.9041584, 100.5292604),
('node', 11364361916, 'Si Rat', 'Si Rat', 'ศรีรัช', 13.9005741, 100.5400085),
('node', 11364361947, 'Muang Thong Thani', 'Muang Thong Thani', 'เมืองทองธานี', 13.8974279, 100.5484467),
('node', 11364361977, 'Chaeng Watthana 14', 'Chaeng Watthana 14', 'แจ้งวัฒนะ 14', 13.8933037, 100.5601498),
('node', 11364411040, 'Min Buri Market', 'Min Buri Market', 'ตลาดมีนบุรี', 13.8125125, 100.7258382),
('node', 11364465363, 'Government Complex', 'Government Complex', 'ศูนย์ราชการเฉลิมพระเกียรติ', 13.8907652, 100.5673522),
('node', 11364501870, 'National Telecom', 'National Telecom', 'โทรคมนาคมแห่งชาติ', 13.8875764, 100.5757143),
('node', 11364501879, 'Lak Si', 'Lak Si', 'หลักสี่', 13.8840791, 100.5826859),
('node', 11364501913, 'Wat Phra Sri Mahathat', 'Wat Phra Sri Mahathat', 'วัดพระศรีมหาธาตุ', 13.8743621, 100.5972049),
('node', 11364501914, 'Rajabhat Phranakhon', 'Rajabhat Phranakhon', 'ราชภัฏพระนคร', 13.8799390, 100.5892957),
('node', 11364501917, 'Ram Inthra 3', 'Ram Inthra 3', 'รามอินทรา 3', 13.8709544, 100.6026204),
('node', 11364501918, 'Lat Pla Khao', 'Lat Pla Khao', 'ลาดปลาเค้า', 13.8627961, 100.6178150),
('node', 11364501919, 'Ram Inthra Kor Mor 4', 'Ram Inthra Kor Mor 4', 'รามอินทรา กม.4', 13.8583122, 100.6261305),
('node', 11364501920, 'Maiyalap', 'Maiyalap', 'มัยลาภ', 13.8550150, 100.6322263),
('node', 11364501922, 'Vacharaphol', 'Vacharaphol', 'วัชรพล', 13.8492636, 100.6428787),
('node', 11364501923, 'Ram Inthra Kor Mor 6', 'Ram Inthra Kor Mor 6', 'รามอินทรา กม.6', 13.8452670, 100.6502444),
('node', 11364501927, 'Ram Inthra Kor Mor 9', 'Ram Inthra Kor Mor 9', 'รามอินทรา กม.9', 13.8337874, 100.6675745),
('node', 11364501928, 'Khu Bon', 'Khu Bon', 'คู้บอน', 13.8406246, 100.6587866),
('node', 11364501929, 'Outer Ring Road-Ram Inthra', 'Outer Ring Road-Ram Inthra', 'วงแหวนรามอินทรา', 13.8244533, 100.6772099),
('node', 11364501940, 'Bang Chan', 'Bang Chan', 'บางชัน', 13.8127236, 100.7029370),
('node', 11364501941, 'Nopparat', 'Nopparat', 'นพรัตน์', 13.8165312, 100.6856510),
('node', 11364501942, 'Setthabutbamphen', 'Setthabutbamphen', 'เศรษฐบุตรบำเพ็ญ', 13.8126940, 100.7126294),
('node', 11364501951, 'Min Buri', 'Min Buri', 'มีนบุรี', 13.8084135, 100.7326906),
('node', 11505460640, 'National Stadium', 'National Stadium', 'สนามกีฬาแห่งชาติ', 13.7465100, 100.5290855),
('node', 12803589960, 'Si Lom', 'Si Lom', 'สีลม', 13.7291982, 100.5370702),
('node', 12803915074, 'Wat Mangkon', 'Wat Mangkon', 'วัดมังกร', 13.7422095, 100.5099097),
('node', 12803915076, 'Sam Yot', 'Sam Yot', 'สามยอด', 13.7470004, 100.5023022),
('node', 12803915077, 'Sanam Chai', 'Sanam Chai', 'สนามไชย', 13.7443259, 100.4946239),
('node', 12803915078, 'Sam Yan', 'Sam Yan', 'สามย่าน', 13.7320608, 100.5301206),
('node', 12803915080, 'Itsaraphap', 'Itsaraphap', 'อิสรภาพ', 13.7383645, 100.4857002),
('node', 12803915082, 'Bang Sue', 'Bang Sue', 'บางซื่อ', 13.8023925, 100.5410464),
('node', 12805950167, 'Phetchaburi', 'Phetchaburi', 'เพชรบุรี', 13.7491853, 100.5634165)
on conflict (osm_type, osm_id) do nothing;

insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 7989376, 'BTS', 'Sukhumvit Line', 'สายสุขุมวิท', '#7FBF3F', array(
  select s.id from unnest(array[6124793523, 6124793522, 6124793521, 6124793517, 6124793516, 6124793515, 6124793514, 6124793513, 5391659126, 5391599348, 5391610964, 5391613497, 5391616767, 5391618414, 5391620400, 5391610985, 5405616025, 5391626092, 5391626093, 5391625873, 5391628766, 5391631777, 5391636575, 1692209237, 5388611982, 5388610344, 5391611863, 5388638318, 5388607091, 1285516977, 5388599065, 6966466946, 6681609030, 6681609029, 6681609028, 6681609027, 6681609026, 6681609025, 6681609024, 3805378261, 6681609020, 6681609019, 6681609018, 6681609017, 6681609016, 6681609012, 8214007176]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 444659, 'MRT', 'Blue Line', 'สายสีน้ำเงิน', '#1E4D9B', array(
  select s.id from unnest(array[2094758805, 3801037850, 7096345624, 2094758837, 3801037853, 6563228219, 3801037852, 3801037855, 3801040557, 7769639098, 12803915082, 280240589, 280240585, 280240580, 280240577, 280239363, 280239362, 280239009, 280240574, 280179427, 12805950167, 5391691787, 280179448, 280729450, 280222462, 12803589960, 12803915078, 280179404, 12803915074, 12803915076, 12803915077, 12803915080, 2094758805, 3801040558, 7769639097, 3801040564, 3801040559, 3801037856, 3801040561]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 7725057, 'MRT', 'Purple Line', 'สายสีม่วง', '#6B3FA0', array(
  select s.id from unnest(array[7769639098, 5222817656, 5222817655, 5222817654, 5222843685, 5222843684, 5222843683, 5222843682, 5222843681, 5222843680, 5222843679, 5222843678, 5222843677, 5222843676, 5222843675, 5222843674]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 15806897, 'MRT', 'Yellow Line', 'สายสีเหลือง', '#F5D000', array(
  select s.id from unnest(array[8717933838, 10867419330, 10867419331, 10867419332, 10867419333, 10867419329, 10867419328, 10867419327, 10867419326, 10867419325, 10867419323, 10867419322, 10867419321, 10830450763, 10830450762, 10830450761, 10830450760, 9734008619, 9734008618, 7781303392]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 16740886, 'MRT', 'Pink Line', 'สายสีชมพู', '#E5007E', array(
  select s.id from unnest(array[11364308559, 11364361871, 11364361876, 11364361878, 11364361879, 11364361877, 11364361880, 11364361882, 11364361916, 11364361947, 11364361977, 11364465363, 11364501870, 11364501879, 11364501914, 11364501913, 11364501917, 11364501918, 11364501919, 11364501920, 11364501922, 11364501923, 11364501928, 11364501927, 11364501929, 11364501941, 11364501940, 11364501942, 11364411040, 11364501951]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 11681439, 'BTS', 'Gold Line', 'สายสีทอง', '#C9A227', array(
  select s.id from unnest(array[7947551369, 5812248586, 5812248587]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 2148241, 'ARL', 'Airport Rail Link', 'แอร์พอร์ต เรล ลิงก์', '#8B1A1A', array(
  select s.id from unnest(array[6711028526, 6711026524, 6711023184, 6711009224, 970112998, 6711014684, 6711016582, 6711003839]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 13058390, 'SRT', 'Dark Red Line', 'สายสีแดงเข้ม', '#A6192E', array(
  select s.id from unnest(array[6024782068, 7787093479, 7787093478, 7787093477, 7787093476, 7787093475, 7787093474, 7787093472, 7787093471, 8986366369]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
insert into public.transit_lines (osm_id, network, name_en, name_th, colour, station_ids)
select 7989385, 'BTS', 'Silom Line', 'สายสีลม', '#00846A', array(
  select s.id from unnest(array[11505460640, 1692209237, 257066809, 451697335, 257066790, 7781158247, 257066779, 257067085, 443815144, 443815142, 305693940, 340133002, 1113055052, 7769639096]::bigint[]) with ordinality as u (osm_id, ord)
  join public.transit_stations s on s.osm_type = 'node' and s.osm_id = u.osm_id order by u.ord)
on conflict (osm_id) do nothing;
