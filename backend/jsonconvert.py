import pandas as pd
import json
import random

# Load CSV
df = pd.read_csv("/Users/karthikeyan/Downloads/ipl_2025_auction_players.csv")

ROLE_MAP = {
    "BAT": "Batter",
    "BOWL": "Bowler",
    "AR": "AllRounder",
    "WK": "WicketKeeper"
}

# 1. Hardcoded set of foreign players for fast lookup
FOREIGN_PLAYERS = {
    "Heinrich Klaasen", "Pat Cummins", "Travis Head", "Matheesha Pathirana",
    "Tristan Stubbs", "Sunil Narine", "Andre Russell", "Jos Buttler",
    "Kagiso Rabada", "Mitchell Starc", "Liam Livingstone", "David Miller",
    "Harry Brook", "Devon Conway", "Jake Fraser-McGurk", "Aiden Markram",
    "David Warner", "Rachin Ravindra", "Marcus Stoinis", "Jonny Bairstow",
    "Quinton de Kock", "Rahmanullah Gurbaz", "Phil Salt", "Trent Boult",
    "Josh Hazlewood", "Anrich Nortje", "Noor Ahmad", "Wanindu Hasaranga",
    "Waqar Salamkheil", "Maheesh Theekshana", "Adam Zampa", "Faf du Plessis",
    "Glenn Phillips", "Rovman Powell", "Kane Williamson", "Sam Curran",
    "Marco Jansen", "Daryl Mitchell", "Alex Carey", "Donovan Ferreira",
    "Shai Hope", "Josh Inglis", "Ryan Rickelton", "Gerald Coetzee",
    "Lockie Ferguson", "AM Ghazanfar", "Akeal Hosein", "Keshav Maharaj",
    "Mujeeb Ur Rahman", "Adil Rashid", "Vijayakanth Viyaskanth", "Finn Allen",
    "Dewald Brevis", "Ben Duckett", "Rilee Rossouw", "Sherfane Rutherford",
    "Ashton Turner", "James Vince", "Moeen Ali", "Tim David", "Will Jacks",
    "Azmatullah Omarzai", "Romario Shepherd", "Tom Banton", "Sam Billings",
    "Jordan Cox", "Ben McDermott", "Kusal Mendis", "Kusal Perera",
    "Josh Philippe", "Tim Seifert", "Nandre Burger", "Spencer Johnson",
    "Mustafizur Rahman", "Nuwan Thushara", "Naveen-ul-Haq", "Rishad Hossain",
    "Zahir Khan", "Nqabayomzi Peter", "Tabraiz Shamsi", "Jeffrey Vandersay",
    "Sediqullah Atal", "Matthew Breetzke", "Mark Chapman", "Brandon King",
    "Evin Lewis", "Pathum Nissanka", "Bhanuka Rajapaksa", "Steven Smith",
    "Gus Atkinson", "Tom Curran", "Mohammad Nabi", "Gulbadin Naib",
    "Sikandar Raza", "Mitchell Santner", "Johnson Charles", "Litton Das",
    "Andre Fletcher", "Tom Latham", "Ollie Pope", "Kyle Verreynne",
    "Fazalhaq Farooqi", "Richard Gleeson", "Matt Henry", "Alzarri Joseph",
    "Kwena Maphaka", "Reece Topley", "Lizaad Williams", "Luke Wood",
    "Leus du Plooy", "Michael Pepper", "Towhid Hridoy", "Mikyle Louis",
    "Harry Tector", "Rassie van der Dussen", "Will Young", "Najibullah Zadran",
    "Ibrahim Zadran", "Sean Abbott", "Jacob Bethell", "Brydon Carse",
    "Aaron Hardie", "Kyle Mayers", "Kamindu Mendis", "Matthew Short",
    "Jason Behrendorff", "Dushmantha Chameera", "Nathan Ellis", "Shamar Joseph",
    "Josh Little", "Jhye Richardson", "Tom Kohler-Cadmore", "Qais Ahmad",
    "Charith Asalanka", "Michael Bracewell", "Gudakesh Motie", "Dan Mousley",
    "Jamie Overton", "Dunith Wellalage", "Ottneil Baartman", "Xavier Bartlett",
    "Dilshan Madushanka", "Adam Milne", "Lungi Ngidi", "William O'Rourke",
    "Jason Holder", "Karim Janat", "James Neesham", "Daniel Sams",
    "Will Sutherland", "Taskin Ahmed", "Ben Dwarshuis", "Obed McCoy",
    "Riley Meredith", "Lance Morris", "Olly Stone", "Daniel Worrall",
    "Zakary Foulkes", "Chris Green", "Shakib Al Hasan", "Mehidy Hasan Miraz",
    "Wiaan Mulder", "Dwaine Pretorius", "Dasun Shanaka", "Shoriful Islam",
    "Blessing Muzarabani", "Matthew Potts", "Tanzim Hasan Sakib", "Ben Sears",
    "Tim Southee", "John Turner", "Brandon McMullen", "Faridoon Dawoodzai",
    "Ashton Agar", "Roston Chase", "Junior Dala", "Mahedi Hasan",
    "Nangeyalia Kharote", "Dan Lawrence", "Nathan Smith", "James Anderson",
    "Kyle Jamieson", "Chris Jordan", "Hasan Mahmud", "Tymal Mills",
    "David Payne", "Nahid Rana", "Alick Athanaze", "Hilton Cartwright",
    "Dominic Drakes", "Daryn Dupavillon", "Matthew Forde", "Patrick Kruger",
    "Lahiru Kumara", "Michael Neser", "Richard Ngarava", "Wayne Parnell",
    "Keemo Paul", "Odean Smith", "Andrew Tye", "Corbin Bosch", "Eshan Malinga",
    "Dumindu Sewmina", "Duan Jansen", "Benny Howell", "Jofra Archer",
    "Saurabh Netravalkar"
}

def parse_price(value):
    """
    Converts auction prices to float.
    Returns None for Unsold, -, NaN, etc.
    """
    try:
        value = str(value).strip()

        if value.lower() == "unsold":
            return None

        if value == "-":
            return None

        return float(value)

    except:
        return None

def generate_rating(sold_price):
    """
    Generates player rating based on sold price.
    Unsold players get lower ratings.
    """
    price = parse_price(sold_price)

    if price is None:
        return random.randint(50, 64)

    if price >= 20:
        return random.randint(95, 99)
    elif price >= 15:
        return random.randint(90, 94)
    elif price >= 10:
        return random.randint(85, 89)
    elif price >= 5:
        return random.randint(75, 84)
    elif price >= 2:
        return random.randint(65, 74)
    else:
        return random.randint(50, 64)

players = []

for idx, row in df.iterrows():

    retained = str(row["Base"]).strip() == "-"
    player_name = str(row["Players"]).strip()

    player = {
        "id": idx + 1,
        "name": player_name,
        "role": ROLE_MAP.get(str(row["Type"]).strip(), str(row["Type"]).strip()),
        "rating": generate_rating(row["Sold"]),
        "basePrice": 0 if retained else parse_price(row["Base"]),
        "team": str(row["Team"]).strip() if retained else None,
        "retained": retained,
        "soldPrice": parse_price(row["Sold"]),
        # 2. Add the nation tag based on the set
        "nation": "Foreigner" if player_name in FOREIGN_PLAYERS else "Indian"
    }

    players.append(player)

# Write players.js
with open("players.js", "w", encoding="utf-8") as f:
    f.write("export const players = ")
    json.dump(players, f, indent=2)
    f.write(";")

print(f"Generated {len(players)} players in players.js")