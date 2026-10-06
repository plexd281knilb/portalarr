/**
 * Official Built-in Academy Award: Best Picture Winners Registry
 * Enables instant matching and placeholder generation for Oscar Best Picture collections
 * without requiring an external MDBList API key or network access.
 */

export interface OscarWinnerEntry {
    rank: number; // Ceremony order or chronologic rank
    title: string;
    year: number; // Release year
    ceremonyYear: number;
    imdbId: string;
    tmdbId: number;
    mediaType: "movie";
}

export const OSCAR_BEST_PICTURE_WINNERS: OscarWinnerEntry[] = [
    { rank: 96, title: "Oppenheimer", year: 2023, ceremonyYear: 2024, imdbId: "tt15398776", tmdbId: 872585, mediaType: "movie" },
    { rank: 95, title: "Everything Everywhere All at Once", year: 2022, ceremonyYear: 2023, imdbId: "tt6710474", tmdbId: 545611, mediaType: "movie" },
    { rank: 94, title: "CODA", year: 2021, ceremonyYear: 2022, imdbId: "tt10366460", tmdbId: 776503, mediaType: "movie" },
    { rank: 93, title: "Nomadland", year: 2020, ceremonyYear: 2021, imdbId: "tt9770150", tmdbId: 581734, mediaType: "movie" },
    { rank: 92, title: "Parasite", year: 2019, ceremonyYear: 2020, imdbId: "tt6751668", tmdbId: 496243, mediaType: "movie" },
    { rank: 91, title: "Green Book", year: 2018, ceremonyYear: 2019, imdbId: "tt6966692", tmdbId: 490132, mediaType: "movie" },
    { rank: 90, title: "The Shape of Water", year: 2017, ceremonyYear: 2018, imdbId: "tt5580390", tmdbId: 399055, mediaType: "movie" },
    { rank: 89, title: "Moonlight", year: 2016, ceremonyYear: 2017, imdbId: "tt4975722", tmdbId: 376867, mediaType: "movie" },
    { rank: 88, title: "Spotlight", year: 2015, ceremonyYear: 2016, imdbId: "tt1895587", tmdbId: 314365, mediaType: "movie" },
    { rank: 87, title: "Birdman or (The Unexpected Virtue of Ignorance)", year: 2014, ceremonyYear: 2015, imdbId: "tt2562232", tmdbId: 194662, mediaType: "movie" },
    { rank: 86, title: "12 Years a Slave", year: 2013, ceremonyYear: 2014, imdbId: "tt2024544", tmdbId: 76203, mediaType: "movie" },
    { rank: 85, title: "Argo", year: 2012, ceremonyYear: 2013, imdbId: "tt1024648", tmdbId: 68734, mediaType: "movie" },
    { rank: 84, title: "The Artist", year: 2011, ceremonyYear: 2012, imdbId: "tt1655442", tmdbId: 74643, mediaType: "movie" },
    { rank: 83, title: "The King's Speech", year: 2010, ceremonyYear: 2011, imdbId: "tt1504320", tmdbId: 45269, mediaType: "movie" },
    { rank: 82, title: "The Hurt Locker", year: 2008, ceremonyYear: 2010, imdbId: "tt0887912", tmdbId: 12162, mediaType: "movie" },
    { rank: 81, title: "Slumdog Millionaire", year: 2008, ceremonyYear: 2009, imdbId: "tt1010048", tmdbId: 12405, mediaType: "movie" },
    { rank: 80, title: "No Country for Old Men", year: 2007, ceremonyYear: 2008, imdbId: "tt0477348", tmdbId: 6977, mediaType: "movie" },
    { rank: 79, title: "The Departed", year: 2006, ceremonyYear: 2007, imdbId: "tt0407887", tmdbId: 1422, mediaType: "movie" },
    { rank: 78, title: "Crash", year: 2004, ceremonyYear: 2006, imdbId: "tt0375679", tmdbId: 1669, mediaType: "movie" },
    { rank: 77, title: "Million Dollar Baby", year: 2004, ceremonyYear: 2005, imdbId: "tt0405159", tmdbId: 70, mediaType: "movie" },
    { rank: 76, title: "The Lord of the Rings: The Return of the King", year: 2003, ceremonyYear: 2004, imdbId: "tt0167260", tmdbId: 122, mediaType: "movie" },
    { rank: 75, title: "Chicago", year: 2002, ceremonyYear: 2003, imdbId: "tt0299658", tmdbId: 1574, mediaType: "movie" },
    { rank: 74, title: "A Beautiful Mind", year: 2001, ceremonyYear: 2002, imdbId: "tt0268978", tmdbId: 453, mediaType: "movie" },
    { rank: 73, title: "Gladiator", year: 2000, ceremonyYear: 2001, imdbId: "tt0172495", tmdbId: 98, mediaType: "movie" },
    { rank: 72, title: "American Beauty", year: 1999, ceremonyYear: 2000, imdbId: "tt0169547", tmdbId: 14, mediaType: "movie" },
    { rank: 71, title: "Shakespeare in Love", year: 1998, ceremonyYear: 1999, imdbId: "tt0138097", tmdbId: 1924, mediaType: "movie" },
    { rank: 70, title: "Titanic", year: 1997, ceremonyYear: 1998, imdbId: "tt0120338", tmdbId: 597, mediaType: "movie" },
    { rank: 69, title: "The English Patient", year: 1996, ceremonyYear: 1997, imdbId: "tt0116209", tmdbId: 409, mediaType: "movie" },
    { rank: 68, title: "Braveheart", year: 1995, ceremonyYear: 1996, imdbId: "tt0112573", tmdbId: 197, mediaType: "movie" },
    { rank: 67, title: "Forrest Gump", year: 1994, ceremonyYear: 1995, imdbId: "tt0109830", tmdbId: 13, mediaType: "movie" },
    { rank: 66, title: "Schindler's List", year: 1993, ceremonyYear: 1994, imdbId: "tt0108052", tmdbId: 424, mediaType: "movie" },
    { rank: 65, title: "Unforgiven", year: 1992, ceremonyYear: 1993, imdbId: "tt0105695", tmdbId: 33, mediaType: "movie" },
    { rank: 64, title: "The Silence of the Lambs", year: 1991, ceremonyYear: 1992, imdbId: "tt0102926", tmdbId: 274, mediaType: "movie" },
    { rank: 63, title: "Dances with Wolves", year: 1990, ceremonyYear: 1991, imdbId: "tt0099348", tmdbId: 581, mediaType: "movie" },
    { rank: 62, title: "Driving Miss Daisy", year: 1989, ceremonyYear: 1990, imdbId: "tt0097239", tmdbId: 9449, mediaType: "movie" },
    { rank: 61, title: "Rain Man", year: 1988, ceremonyYear: 1989, imdbId: "tt0095953", tmdbId: 380, mediaType: "movie" },
    { rank: 60, title: "The Last Emperor", year: 1987, ceremonyYear: 1988, imdbId: "tt0093389", tmdbId: 746, mediaType: "movie" },
    { rank: 59, title: "Platoon", year: 1986, ceremonyYear: 1987, imdbId: "tt0091763", tmdbId: 792, mediaType: "movie" },
    { rank: 58, title: "Out of Africa", year: 1985, ceremonyYear: 1986, imdbId: "tt0089755", tmdbId: 658, mediaType: "movie" },
    { rank: 57, title: "Amadeus", year: 1984, ceremonyYear: 1985, imdbId: "tt0086879", tmdbId: 279, mediaType: "movie" },
    { rank: 56, title: "Terms of Endearment", year: 1983, ceremonyYear: 1984, imdbId: "tt0086425", tmdbId: 11023, mediaType: "movie" },
    { rank: 55, title: "Gandhi", year: 1982, ceremonyYear: 1983, imdbId: "tt0083987", tmdbId: 783, mediaType: "movie" },
    { rank: 54, title: "Chariots of Fire", year: 1981, ceremonyYear: 1982, imdbId: "tt0082158", tmdbId: 10459, mediaType: "movie" },
    { rank: 53, title: "Ordinary People", year: 1980, ceremonyYear: 1981, imdbId: "tt0081283", tmdbId: 16619, mediaType: "movie" },
    { rank: 52, title: "Kramer vs. Kramer", year: 1979, ceremonyYear: 1980, imdbId: "tt0079417", tmdbId: 12159, mediaType: "movie" },
    { rank: 51, title: "The Deer Hunter", year: 1978, ceremonyYear: 1979, imdbId: "tt0077416", tmdbId: 11778, mediaType: "movie" },
    { rank: 50, title: "Annie Hall", year: 1977, ceremonyYear: 1978, imdbId: "tt0075686", tmdbId: 703, mediaType: "movie" },
    { rank: 49, title: "Rocky", year: 1976, ceremonyYear: 1977, imdbId: "tt0075148", tmdbId: 1366, mediaType: "movie" },
    { rank: 48, title: "One Flew Over the Cuckoo's Nest", year: 1975, ceremonyYear: 1976, imdbId: "tt0073486", tmdbId: 510, mediaType: "movie" },
    { rank: 47, title: "The Godfather Part II", year: 1974, ceremonyYear: 1975, imdbId: "tt0071562", tmdbId: 240, mediaType: "movie" },
    { rank: 46, title: "The Sting", year: 1973, ceremonyYear: 1974, imdbId: "tt0070735", tmdbId: 9277, mediaType: "movie" },
    { rank: 45, title: "The Godfather", year: 1972, ceremonyYear: 1973, imdbId: "tt0068646", tmdbId: 238, mediaType: "movie" },
    { rank: 44, title: "The French Connection", year: 1971, ceremonyYear: 1972, imdbId: "tt0067116", tmdbId: 1051, mediaType: "movie" },
    { rank: 43, title: "Patton", year: 1970, ceremonyYear: 1971, imdbId: "tt0066206", tmdbId: 11202, mediaType: "movie" },
    { rank: 42, title: "Midnight Cowboy", year: 1969, ceremonyYear: 1970, imdbId: "tt0064665", tmdbId: 211, mediaType: "movie" },
    { rank: 41, title: "Oliver!", year: 1968, ceremonyYear: 1969, imdbId: "tt0063385", tmdbId: 11449, mediaType: "movie" },
    { rank: 40, title: "In the Heat of the Night", year: 1967, ceremonyYear: 1968, imdbId: "tt0061811", tmdbId: 11623, mediaType: "movie" },
    { rank: 39, title: "A Man for All Seasons", year: 1966, ceremonyYear: 1967, imdbId: "tt0060665", tmdbId: 10793, mediaType: "movie" },
    { rank: 38, title: "The Sound of Music", year: 1965, ceremonyYear: 1966, imdbId: "tt0059742", tmdbId: 15121, mediaType: "movie" },
    { rank: 37, title: "My Fair Lady", year: 1964, ceremonyYear: 1965, imdbId: "tt0058385", tmdbId: 11113, mediaType: "movie" },
    { rank: 36, title: "Tom Jones", year: 1963, ceremonyYear: 1964, imdbId: "tt0057590", tmdbId: 11488, mediaType: "movie" },
    { rank: 35, title: "Lawrence of Arabia", year: 1962, ceremonyYear: 1963, imdbId: "tt0056172", tmdbId: 947, mediaType: "movie" },
    { rank: 34, title: "West Side Story", year: 1961, ceremonyYear: 1962, imdbId: "tt0055614", tmdbId: 1725, mediaType: "movie" },
    { rank: 33, title: "The Apartment", year: 1960, ceremonyYear: 1961, imdbId: "tt0053604", tmdbId: 284, mediaType: "movie" },
    { rank: 32, title: "Ben-Hur", year: 1959, ceremonyYear: 1960, imdbId: "tt0052618", tmdbId: 665, mediaType: "movie" },
    { rank: 31, title: "Gigi", year: 1958, ceremonyYear: 1959, imdbId: "tt0051658", tmdbId: 20024, mediaType: "movie" },
    { rank: 30, title: "The Bridge on the River Kwai", year: 1957, ceremonyYear: 1958, imdbId: "tt0050212", tmdbId: 826, mediaType: "movie" },
    { rank: 29, title: "Around the World in 80 Days", year: 1956, ceremonyYear: 1957, imdbId: "tt0048960", tmdbId: 1978, mediaType: "movie" },
    { rank: 28, title: "Marty", year: 1955, ceremonyYear: 1956, imdbId: "tt0048356", tmdbId: 15919, mediaType: "movie" },
    { rank: 27, title: "On the Waterfront", year: 1954, ceremonyYear: 1955, imdbId: "tt0047296", tmdbId: 654, mediaType: "movie" },
    { rank: 26, title: "From Here to Eternity", year: 1953, ceremonyYear: 1954, imdbId: "tt0045793", tmdbId: 998, mediaType: "movie" },
    { rank: 25, title: "The Greatest Show on Earth", year: 1952, ceremonyYear: 1953, imdbId: "tt0044672", tmdbId: 27589, mediaType: "movie" },
    { rank: 24, title: "An American in Paris", year: 1951, ceremonyYear: 1952, imdbId: "tt0043278", tmdbId: 844, mediaType: "movie" },
    { rank: 23, title: "All About Eve", year: 1950, ceremonyYear: 1951, imdbId: "tt0042192", tmdbId: 705, mediaType: "movie" },
    { rank: 22, title: "All the King's Men", year: 1949, ceremonyYear: 1950, imdbId: "tt0041113", tmdbId: 25448, mediaType: "movie" },
    { rank: 21, title: "Hamlet", year: 1948, ceremonyYear: 1949, imdbId: "tt0040416", tmdbId: 23383, mediaType: "movie" },
    { rank: 20, title: "Gentleman's Agreement", year: 1947, ceremonyYear: 1948, imdbId: "tt0039416", tmdbId: 28409, mediaType: "movie" },
    { rank: 19, title: "The Best Years of Our Lives", year: 1946, ceremonyYear: 1947, imdbId: "tt0036868", tmdbId: 894, mediaType: "movie" },
    { rank: 18, title: "The Lost Weekend", year: 1945, ceremonyYear: 1946, imdbId: "tt0037884", tmdbId: 27419, mediaType: "movie" },
    { rank: 17, title: "Going My Way", year: 1944, ceremonyYear: 1945, imdbId: "tt0036872", tmdbId: 27418, mediaType: "movie" },
    { rank: 16, title: "Casablanca", year: 1942, ceremonyYear: 1944, imdbId: "tt0034583", tmdbId: 289, mediaType: "movie" },
    { rank: 15, title: "Mrs. Miniver", year: 1942, ceremonyYear: 1943, imdbId: "tt0035093", tmdbId: 27417, mediaType: "movie" },
    { rank: 14, title: "How Green Was My Valley", year: 1941, ceremonyYear: 1942, imdbId: "tt0033729", tmdbId: 10425, mediaType: "movie" },
    { rank: 13, title: "Rebecca", year: 1940, ceremonyYear: 1941, imdbId: "tt0032976", tmdbId: 223, mediaType: "movie" },
    { rank: 12, title: "Gone with the Wind", year: 1939, ceremonyYear: 1940, imdbId: "tt0031381", tmdbId: 770, mediaType: "movie" },
    { rank: 11, title: "You Can't Take It with You", year: 1938, ceremonyYear: 1939, imdbId: "tt0030993", tmdbId: 34107, mediaType: "movie" },
    { rank: 10, title: "The Life of Emile Zola", year: 1937, ceremonyYear: 1938, imdbId: "tt0029146", tmdbId: 43763, mediaType: "movie" },
    { rank: 9, title: "The Great Ziegfeld", year: 1936, ceremonyYear: 1937, imdbId: "tt0027698", tmdbId: 27244, mediaType: "movie" },
    { rank: 8, title: "Mutiny on the Bounty", year: 1935, ceremonyYear: 1936, imdbId: "tt0026752", tmdbId: 14298, mediaType: "movie" },
    { rank: 7, title: "It Happened One Night", year: 1934, ceremonyYear: 1935, imdbId: "tt0025316", tmdbId: 3078, mediaType: "movie" },
    { rank: 6, title: "Cavalcade", year: 1933, ceremonyYear: 1934, imdbId: "tt0023876", tmdbId: 44026, mediaType: "movie" },
    { rank: 5, title: "Grand Hotel", year: 1932, ceremonyYear: 1933, imdbId: "tt0022958", tmdbId: 33430, mediaType: "movie" },
    { rank: 4, title: "Cimarron", year: 1931, ceremonyYear: 1932, imdbId: "tt0021746", tmdbId: 43765, mediaType: "movie" },
    { rank: 3, title: "All Quiet on the Western Front", year: 1930, ceremonyYear: 1931, imdbId: "tt0020629", tmdbId: 143, mediaType: "movie" },
    { rank: 2, title: "The Broadway Melody", year: 1929, ceremonyYear: 1930, imdbId: "tt0019729", tmdbId: 65203, mediaType: "movie" },
    { rank: 1, title: "Wings", year: 1927, ceremonyYear: 1929, imdbId: "tt0018578", tmdbId: 28964, mediaType: "movie" }
];

export function getBuiltinOscarBestPictureList(): OscarWinnerEntry[] {
    return OSCAR_BEST_PICTURE_WINNERS;
}
