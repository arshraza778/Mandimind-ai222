Chhattisgarh LGD district and development-block dataset

Files
- chhattisgarh_blocks.csv: 146 unique development blocks, with state, district and block LGD codes, representative latitude/longitude, and source labels.
- chhattisgarh_districts.csv: 33 Chhattisgarh districts and their LGD codes.
- chhattisgarh_blocks.geojson: block polygon features with the same properties and representative coordinates.
- chhattisgarh_block_points.geojson: point features for GIS use.

Coordinates
Latitude/longitude are representative points on the surface of each block polygon, calculated with point_on_surface after transforming the source layer to WGS84 (EPSG:4326). They represent the block area and are not administrative-office locations. For each point, the GeoJSON coordinate order is longitude, latitude; the CSV has separate latitude and longitude columns.

Names and codes
District and block names/codes were retrieved on 2026-10-13 from an independent, keyless mirror of the Government of India's Local Government Directory (LGD) hierarchy. Its records were joined by LGD codes to the LGD_Blocks polygon layer. The boundary layer contains 146 unique block LGD codes. The hierarchy endpoint returned one duplicate listing for block code 3676 (Khadgawana) under two districts; this dataset keeps one row and assigns the block to district LGD code 760 using the polygon's district-code attribute. No unique block code was missing from the polygon layer.

Sources
- Official LGD portal: https://lgdirectory.gov.in/
- Official LGD block-code lookup: https://lgdirectory.gov.in/globalviewBlockforcitizen.do
- Official LGD Download Directory: https://lgdirectory.gov.in/downloadDirectory.do
- LGD hierarchy mirror API: https://india-lgd-index-api.vercel.app/ (describes its data as the official LGD hierarchy served through an independent mirror)
- Polygon source: India Geodata LGD_Blocks release, published 2026-03-08: https://github.com/yashveeeeeeer/india-geodata/releases/tag/admin/blocks
- Official Chhattisgarh NIC State GIS portal: https://stategisportal.nic.in/stategisportal/Home/State/22

The polygon layer is a community-hosted distribution of LGD-sourced boundaries, not a government-hosted download. Names and codes should be checked against the official LGD portal before consequential use.
