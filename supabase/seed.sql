insert into public."ItemType" ("id", "Type")
values
  (1, 'Skin'),
  (2, 'Chroma'),
  (3, 'Emote'),
  (4, 'Icon'),
  (5, 'Finisher'),
  (6, 'Ward'),
  (7, 'Title')
on conflict ("id") do update
set "Type" = excluded."Type";