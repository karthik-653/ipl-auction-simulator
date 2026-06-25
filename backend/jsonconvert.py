import pandas as pd
import json
import random
import math

# Load CSV
df = pd.read_csv("/Users/karthikeyan/Downloads/ipl_2025_auction_players.csv")

ROLE_MAP = {
    "BAT": "Batter",
    "BOWL": "Bowler",
    "AR": "AllRounder",
    "WK": "WicketKeeper"
}

FOREIGN_PLAYERS = {
    "Heinrich Klaasen", "Pat Cummins", "Travis Head", "Matheesha Pathirana", "Tristan Stubbs", "Sunil Narine", "Andre Russell", "Jos Buttler",
    "Kagiso Rabada", "Mitchell Starc", "Liam Livingstone", "David Miller", "Harry Brook", "Devon Conway", "Jake Fraser-McGurk", "Aiden Markram",
    "David Warner", "Rachin Ravindra", "Marcus Stoinis", "Jonny Bairstow", "Quinton de Kock", "Rahmanullah Gurbaz", "Phil Salt", "Trent Boult",
    "Josh Hazlewood", "Anrich Nortje", "Noor Ahmad", "Wanindu Hasaranga", "Waqar Salamkheil", "Maheesh Theekshana", "Adam Zampa", "Faf du Plessis",
    "Glenn Phillips", "Rovman Powell", "Kane Williamson", "Sam Curran", "Marco Jansen", "Daryl Mitchell", "Alex Carey", "Donovan Ferreira",
    "Shai Hope", "Josh Inglis", "Ryan Rickelton", "Gerald Coetzee", "Lockie Ferguson", "AM Ghazanfar", "Akeal Hosein", "Keshav Maharaj",
    "Mujeeb Ur Rahman", "Adil Rashid", "Vijayakanth Viyaskanth", "Finn Allen", "Dewald Brevis", "Ben Duckett", "Rilee Rossouw", "Sherfane Rutherford",
    "Ashton Turner", "James Vince", "Moeen Ali", "Tim David", "Will Jacks", "Azmatullah Omarzai", "Romario Shepherd", "Tom Banton", "Sam Billings",
    "Jordan Cox", "Ben McDermott", "Kusal Mendis", "Kusal Perera", "Josh Philippe", "Tim Seifert", "Nandre Burger", "Spencer Johnson",
    "Mustafizur Rahman", "Nuwan Thushara", "Naveen-ul-Haq", "Rishad Hossain", "Zahir Khan", "Nqabayomzi Peter", "Tabraiz Shamsi", "Jeffrey Vandersay",
    "Sediqullah Atal", "Matthew Breetzke", "Mark Chapman", "Brandon King", "Evin Lewis", "Pathum Nissanka", "Bhanuka Rajapaksa", "Steven Smith",
    "Gus Atkinson", "Tom Curran", "Mohammad Nabi", "Gulbadin Naib", "Sikandar Raza", "Mitchell Santner", "Johnson Charles", "Litton Das",
    "Andre Fletcher", "Tom Latham", "Ollie Pope", "Kyle Verreynne", "Fazalhaq Farooqi", "Richard Gleeson", "Matt Henry", "Alzarri Joseph",
    "Kwena Maphaka", "Reece Topley", "Lizaad Williams", "Luke Wood", "Leus du Plooy", "Michael Pepper", "Towhid Hridoy", "Mikyle Louis",
    "Harry Tector", "Rassie van der Dussen", "Will Young", "Najibullah Zadran", "Ibrahim Zadran", "Sean Abbott", "Jacob Bethell", "Brydon Carse",
    "Aaron Hardie", "Kyle Mayers", "Kamindu Mendis", "Matthew Short", "Jason Behrendorff", "Dushmantha Chameera", "Nathan Ellis", "Shamar Joseph",
    "Josh Little", "Jhye Richardson", "Tom Kohler-Cadmore", "Qais Ahmad", "Charith Asalanka", "Michael Bracewell", "Gudakesh Motie", "Dan Mousley",
    "Jamie Overton", "Dunith Wellalage", "Ottneil Baartman", "Xavier Bartlett", "Dilshan Madushanka", "Adam Milne", "Lungi Ngidi", "William O'Rourke",
    "Jason Holder", "Karim Janat", "James Neesham", "Daniel Sams", "Will Sutherland", "Taskin Ahmed", "Ben Dwarshuis", "Obed McCoy",
    "Riley Meredith", "Lance Morris", "Olly Stone", "Daniel Worrall", "Zakary Foulkes", "Chris Green", "Shakib Al Hasan", "Mehidy Hasan Miraz",
    "Wiaan Mulder", "Dwaine Pretorius", "Dasun Shanaka", "Shoriful Islam", "Blessing Muzarabani", "Matthew Potts", "Tanzim Hasan Sakib", "Ben Sears",
    "Tim Southee", "John Turner", "Brandon McMullen", "Faridoon Dawoodzai", "Ashton Agar", "Roston Chase", "Junior Dala", "Mahedi Hasan",
    "Nangeyalia Kharote", "Dan Lawrence", "Nathan Smith", "James Anderson", "Kyle Jamieson", "Chris Jordan", "Hasan Mahmud", "Tymal Mills",
    "David Payne", "Nahid Rana", "Alick Athanaze", "Hilton Cartwright", "Dominic Drakes", "Daryn Dupavillon", "Matthew Forde", "Patrick Kruger",
    "Lahiru Kumara", "Michael Neser", "Richard Ngarava", "Wayne Parnell", "Keemo Paul", "Odean Smith", "Andrew Tye", "Corbin Bosch", "Eshan Malinga",
    "Dumindu Sewmina", "Duan Jansen", "Benny Howell", "Jofra Archer", "Saurabh Netravalkar"
}

WICKET_KEEPERS = {
    "Heinrich Klaasen", "MS Dhoni", "Tristan Stubbs", "Abishek Porel", "Sanju Samson", "Dhruv Jurel", "Nicholas Pooran", "Prabhsimran Singh", 
    "Jos Buttler", "Rishabh Pant", "KL Rahul", "Quinton de Kock", "Rahmanullah Gurbaz", "Ishan Kishan", "Phil Salt", "Jitesh Sharma", 
    "Jonny Bairstow", "Anuj Rawat", "Luvnith Sisodia", "Vishnu Vinod", "Upendra Yadav", "Srikar Bharat", "Alex Carey", "Donovan Ferreira", 
    "Shai Hope", "Josh Inglis", "Ryan Rickelton", "Finn Allen", "Tom Banton", "Sam Billings", "Jordan Cox", "Ben McDermott", "Kusal Mendis", 
    "Kusal Perera", "Josh Philippe", "Tim Seifert", "Matthew Breetzke", "Bhanuka Rajapaksa", "Johnson Charles", "Litton Das", "Andre Fletcher", 
    "Tom Latham", "Ollie Pope", "Kyle Verreynne", "Michael Pepper", "Dinesh Bana", "Guruswamy Ajitesh", "Narayan Jagadeesan", 
    "Krishnan Shrijith", "Rithik Easwaran", "Anmol Malhotra", "Pradosh Ranjan Paul", "Mohammed Azharuddeen", "LR Chethan", 
    "Urvil Patel", "Bipin Saurabh", "Aryan Juyal", "Kumar Kushagra", "Robin Minz", "Aravelly Avanish", "Harvik Desai", "Tom Kohler-Cadmore", 
    "Kunal Singh Rathore", "BR Sharath", "Tushar Raheja", "Sumit Ghadigaonkar", "Akhil Rawat", "Hardik Tamore", "Ricky Bhui", "Devon Conway"
}

# Massively expanded to force bowling all-rounders into the Spinner bucket
SPINNERS = {
    "Varun Chakravarthy", "Sunil Narine", "Rashid Khan", "Ravi Bishnoi", "Yuzvendra Chahal", "Rahul Chahar", "Wanindu Hasaranga", 
    "Waqar Salamkheil", "Maheesh Theekshana", "Adam Zampa", "Akeal Hosein", "Keshav Maharaj", "Mujeeb Ur Rahman", "Adil Rashid", 
    "Vijayakanth Viyaskanth", "Tabraiz Shamsi", "Jeffrey Vandersay", "Qais Ahmad", "Gudakesh Motie", "Dunith Wellalage", "Noor Ahmad", 
    "AM Ghazanfar", "Suyash Sharma", "Mayank Markande", "Karn Sharma", "Kumar Kartikeya", "Manav Suthar", "Piyush Chawla", "Shreyas Gopal", 
    "Prashant Solanki", "Jhathavedh Subramanyan", "Zeeshan Ansari", "Jagadeesha Suchith", "Murugan Ashwin", "Shreyas Chavan", 
    "Chintal Gandhi", "Raghav Goyal", "Roshan Waghsare", "Bailapudi Yeswanth", "Rishad Hossain", "Zahir Khan", "Nqabayomzi Peter", "Tanveer Sangha",
    "Sai Kishore", "Mitchell Santner", "Ashton Agar", "Harpreet Brar", "Tanush Kotian", "Shams Mulani", "Praveen Dubey", "Vicky Ostwal", 
    "Jalaj Saxena", "Atharva Ankolekar", "Nishunk Birla", "Khrievitso Kense", "Vignesh Puthur", "Shubhang Hegde", "Saransh Jain", 
    "Hardik Raj", "Harsh Tyagi", "Ninad Rathva", "Sohraab Dhaliwal", "Harsh Dubey", "Shiva Singh", "Chris Green", "P Vignesh", 
    "Sabhay Chadha", "Tripurana Vijay", "Ravi Kumar Yadav", "Lakshay Jain", "Kritagya Singh", "Bharat Sharma", "Rohan Rana", 
    "Sudhesan Midhun", "Abid Mushtaq", "Mahesh Pithiya", "KC Cariappa"
}

def parse_price(value):
    try:
        value = str(value).strip()
        if value.lower() == "unsold" or value == "-":
            return None
        return float(value)
    except:
        return None

def generate_rating(sold_price):
    price = parse_price(sold_price)

    # Base rating for Unsold players
    if price is None:
        return 55

    # Cap the maximum price calculation at 25.0 Cr so rating doesn't exceed 99
    if price >= 25.0:
        return 99

    # Define brackets: (min_price, max_price, min_rating, max_rating)
    brackets = [
        (0.0, 2.0, 50, 64),
        (2.0, 5.0, 65, 74),
        (5.0, 10.0, 75, 84),
        (10.0, 15.0, 85, 89),
        (15.0, 20.0, 90, 94),
        (20.0, 25.0, 95, 99)
    ]

    for min_p, max_p, min_r, max_r in brackets:
        if min_p <= price < max_p or (price == max_p and max_p == 25.0):
            # Calculate exactly where the price falls in this bracket
            fraction = (price - min_p) / (max_p - min_p)
            
            # Apply that fraction to the rating range
            rating = min_r + (fraction * (max_r - min_r))
            
            return int(round(rating))

    return 50 # Fallback

# --- STEP 1: PARSE ALL PLAYERS ---
players_raw = []

for idx, row in df.iterrows():
    retained = str(row["Base"]).strip() == "-"
    player_name = str(row["Players"]).strip()
    
    # Force override roles based on our custom sets
    role = ROLE_MAP.get(str(row["Type"]).strip(), str(row["Type"]).strip())
    
    if player_name in WICKET_KEEPERS:
        role = "WicketKeeper"
    elif player_name in SPINNERS:
        role = "Bowler"  # Forces them out of "AllRounder" so they can become "Spinner" below

    player = {
        "id": idx + 1,
        "name": player_name,
        "role": role,
        "rating": generate_rating(row["Sold"]),
        "basePrice": 0 if retained else parse_price(row["Base"]),
        "team": str(row["Team"]).strip() if retained else None,
        "retained": retained,
        "soldPrice": parse_price(row["Sold"]),
        "nation": "Foreigner" if player_name in FOREIGN_PLAYERS else "Indian"
    }
    players_raw.append(player)

# --- STEP 2: ORGANIZE INTO SET POOLS ---
retained_players = [p for p in players_raw if p["retained"]]
auction_players = [p for p in players_raw if not p["retained"]]

# Pull top 18 highest-rated auction players for the Marquee sets
auction_players.sort(key=lambda x: x["rating"], reverse=True)
marquee_pool = auction_players[:18]
remaining_auction = auction_players[18:]

pools = {
    "Marquee": marquee_pool,
    "Batter": [], "Fast Bowler": [], "Spinner": [], "Allrounder": [], "Wicket Keeper": [],
    "Uncapped Batter": [], "Uncapped Fast Bowler": [], "Uncapped Spinner": [], "Uncapped Allrounder": [], "Uncapped Wicket Keeper": []
}

for p in remaining_auction:
    is_uncapped = p["basePrice"] is not None and p["basePrice"] <= 0.50
    
    if p["role"] == "WicketKeeper": specific_role = "Wicket Keeper"
    elif p["role"] == "AllRounder": specific_role = "Allrounder"
    elif p["role"] == "Batter": specific_role = "Batter"
    elif p["role"] == "Bowler":
        specific_role = "Spinner" if p["name"] in SPINNERS else "Fast Bowler"
    else:
        specific_role = p["role"]
    
    pool_name = f"Uncapped {specific_role}" if is_uncapped else specific_role
    pools[pool_name].append(p)

# Chunk pools into smaller sizes (15-25 players)
def chunk_pool(pool, prefix):
    random.shuffle(pool)
    n_players = len(pool)
    if n_players == 0: return []
    if n_players <= 25: return [{"set_name": f"{prefix}-1", "players": pool}]
        
    num_chunks = math.ceil(n_players / 20.0)
    chunk_size = math.ceil(n_players / num_chunks)
    
    chunks = []
    for i in range(num_chunks):
        start = i * chunk_size
        end = start + chunk_size
        chunks.append({"set_name": f"{prefix}-{i + 1}", "players": pool[start:end]})
    return chunks

auction_sets = []
for pool_name, pool_players in pools.items():
    if len(pool_players) > 0:
        auction_sets.extend(chunk_pool(pool_players, pool_name))

# --- STEP 3: AUTHENTIC IPL AUCTION ORDERING LOGIC ---
marquee_sets = sorted([s for s in auction_sets if "Marquee" in s["set_name"]], key=lambda x: x["set_name"])
base_sets = [s for s in auction_sets if "Marquee" not in s["set_name"]]

def parse_set_metadata(set_name):
    base, round_str = set_name.rsplit('-', 1)
    return int(round_str), "Uncapped" in base

max_rounds = max([parse_set_metadata(s["set_name"])[0] for s in base_sets]) if base_sets else 1

final_ordered_sets = []
final_ordered_sets.extend(marquee_sets)

for r in range(1, max_rounds + 1):
    capped_sets_this_round = [s for s in base_sets if parse_set_metadata(s["set_name"]) == (r, False)]
    random.shuffle(capped_sets_this_round)
    final_ordered_sets.extend(capped_sets_this_round)
    
    uncapped_sets_this_round = [s for s in base_sets if parse_set_metadata(s["set_name"]) == (r, True)]
    random.shuffle(uncapped_sets_this_round)
    final_ordered_sets.extend(uncapped_sets_this_round)

# --- STEP 4: RECONSTRUCT ARRAY WITH CLUBBED SETS ---
final_players = []

for p in retained_players:
    p["set"] = "Retained"
    final_players.append(p)

for s in final_ordered_sets:
    for p in s["players"]:
        p["set"] = s["set_name"]
        final_players.append(p)

# Write to players.js
with open("players.js", "w", encoding="utf-8") as f:
    f.write("export const players = ")
    json.dump(final_players, f, indent=2)
    f.write(";")

print(f"Success! Corrected All-Rounders to Spinners. Total players: {len(final_players)}.")