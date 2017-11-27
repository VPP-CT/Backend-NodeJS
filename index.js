/*!
 * Copyright 2017 Vacation Planner Project. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var express = require('express');
var request = require('request');
var QPXApi = require('qpx-api');
var airlines = require('airline-codes');

var app = express();
var QPXApiClient = new QPXApi({
  api_key: '',
  timeout: 15000
});


// Fix no 'access-control-allow-origin' header problem
var cors = require('cors');
app.use(cors({
  credentials: true,
  origin: true
}))


// Provide only 200 status at root, to prevent DDoS.
app.get('/', function(req, res) {
  console.log('New Visitor', req.ip);
  res.send("200");
})


// Hotels endpoint
app.get('/hotels', function(req, res) {
  parse_hotel(req.query.city, req.query.checkin, req.query.checkout)
    .then(function onFulfilled(value) {
      res.send(value);
    }).catch(function(e) {
      res.send(String(e));
    });
})


// Flights endpoints
app.get('/flights', function(req, res) {
  parse_flight(req.query.budget, req.query.seg,
      req.query.origin1, req.query.dest1, req.query.date1,
      req.query.origin2, req.query.dest2, req.query.date2,
      req.query.origin3, req.query.dest3, req.query.date3,
      req.query.origin4, req.query.dest4, req.query.date4,
      req.query.origin5, req.query.dest5, req.query.date5)
    .then(function onFulfilled(value) {
      res.send(JSON.stringify(value, null, 4))
    }).catch(function(e) {
      res.send(String(e));
    });
})


// Packages endpoint
app.get('/packages', function(req, res) {
  parse_packages(req.query.budget, req.query.seg, req.query.star,
      req.query.origin1, req.query.dest1, req.query.date1,
      req.query.origin2, req.query.dest2, req.query.date2,
      req.query.origin3, req.query.dest3, req.query.date3,
      req.query.origin4, req.query.dest4, req.query.date4,
      req.query.origin5, req.query.dest5, req.query.date5)
    .then(function onFulfilled(value) {
      /**
       * Based on flights information, get hotel information.
       */

      return [value[0], select_package_hotels(value, req.query.budget)];
    }).then(function onFulfilled(value) {
      /**
       * Merge flights and hotels into pacakges.
       */

      var flight_iter = value[0];
      var hotel_iter = value[1];
      var result = {};

      // Append each flight segment into package
      var i = 1;
      flight_iter.forEach(function(value) {
        result['package_' + i] = {}
        result['package_' + i]['flight'] = value;
        i += 1;
      });

      // Append each hotel segment into package
      var i = 1;
      hotel_iter.forEach(function(value) {
        result['package_' + i]['hotel'] = value;
        i += 1;
      });

      // Calculate the total price for package
      for (var i = 1; i <= flight_iter.length; i++) {
        result['package_' + i]['totalPrice'] = result['package_' + i]['hotel']['price'] +
          result['package_' + i]['flight']['price'];
      }

      res.send(JSON.stringify(result, null, 4))
    }).catch(function(e) {
      res.send(String(e));
    });
})


/**
 * Start server block.
 */
var p = process.env.PORT || 8080;
var server = app.listen(p, function() {
  var host = server.address().address
  var port = server.address().port

  console.log('Start on http://%s:%s', host, port)
})


/**
 * parse_hotel - Send hotel query with Expedia mobile hotel API v3 based on
 * given parameters, return a list of hotels.
 *
 * @param  {String} city     destination city name
 * @param  {String} checkin  checkin date, YYYY-MM-DD
 * @param  {String} checkout checkout date, YYYY-MM-DD
 * @return {Object}          formatted hotelList
 */
function parse_hotel(city, checkin, checkout) {
  return new Promise(function(resolve, reject) {
    request('https://www.expedia.com:443/m/api/hotel/search/v3?city=' +
      city +
      '&checkInDate=' +
      checkin +
      '&checkOutDate=' +
      checkout +
      '&room1=2&enableSponsoredListings=false&enableTravelAdsList=false&filterUnavailable=true&priceType=DEFAULT_POS_PRICE_TYPE_WITH_FEES&resultsPerPage=200&returnOpaqueHotels=false&sendAdaptedResponse=false&shopWithPoints=false',
      function(err, response, body) {
        if (!err && response.statusCode == 200) {
          resolve(format_hotel(response.body, checkout));
        } else {
          reject(new Error(err));
        }
      })
  });
}


/**
 * format_hotel - Reformat the flight information based on response.
 * Extract price and duration for sorting.
 *
 * @param  {Object} response List of hotels parsed by parse_hotel()
 * @param  {String} checkout checkout date, YYYY-MM-DD
 * @return {Object}          formatted hotelList
 */
function format_hotel(response, checkout) {
  return new Promise(function(resolve, reject) {
    var formatted = {};
    var raw = JSON.parse(response)['hotelList'];

    for (i in raw) {
      var tmp = {};

      tmp['checkout'] = checkout;
      tmp['city'] = raw[i]['city'];
      tmp['name'] = raw[i]['localizedName'];
      tmp['hotelId'] = raw[i]['hotelId'];
      tmp['address'] = raw[i]['address'];
      tmp['description'] = raw[i]['shortDescription'];
      tmp['availability'] = raw[i]['isHotelAvailable'];
      tmp['roomsLeft'] = raw[i]['roomsLeftAtThisRate'];
      tmp['amenity'] = raw[i]['amenities'];
      tmp['brand'] = raw[i]['jsonHotelBrand']['brandName'];
      tmp['largeThumbnailUrl'] = 'http://images.trvl-media.com' + raw[i]['largeThumbnailUrl'];
      tmp['thumbnailUrl'] = 'http://images.trvl-media.com' + raw[i]['thumbnailUrl'];
      tmp['totalReviews'] = parseInt(raw[i]['totalReviews']);
      tmp['guestRating'] = parseFloat(raw[i]['hotelGuestRating']);
      tmp['starRating'] = parseFloat(raw[i]['hotelStarRating']);
      tmp['rateWithTax'] = parseInt(raw[i]['lowRateInfo']['total']);
      tmp['percentRecommended'] = parseFloat(raw[i]['percentRecommended']);
      tmp['totalRecommendations'] = parseFloat(raw[i]['totalRecommendations']);

      formatted['hotel_' + i] = tmp;
    }

    // Historical problem with [], also effect to package hotel parsing.
    resolve([formatted]);
  });
}


/**
 * parse_flight - Send flight query with Google QPX API based on given
 * parameters.
 *
 * @param  {String} budget The total budget for the trip
 * @param  {String} seg    How many segments the given trip has
 * @param  {String} o_1    The 1st departure city
 * @param  {String} d_1    The 1st arrival city
 * @param  {String} date_1 The departure time for 1st trip, YYYY-MM-DD
 * @param  {String} o_2    The 2nd departure city
 * @param  {String} d_2    The 2nd arrival city
 * @param  {String} date_2 The departure time for 2nd trip, YYYY-MM-DD
 * @param  {String} o_3    The 3rd departure city
 * @param  {String} d_3    The 3rd arrival city
 * @param  {String} date_3 The departure time for 3rd trip, YYYY-MM-DD
 * @param  {String} o_4    The 4th departure city
 * @param  {String} d_4    The 4th arrival city
 * @param  {String} date_4 The departure time for 4th trip, YYYY-MM-DD
 * @param  {String} o_5    The 5th departure city
 * @param  {String} d_5    The 5th arrival city
 * @param  {String} date_5 The departure time for 5th trip, YYYY-MM-DD
 * @return {Object}        The formatted flights results
 */
function parse_flight(budget, seg, o_1, d_1, date_1, o_2, d_2, date_2, o_3, d_3, date_3, o_4, d_4, date_4, o_5, d_5, date_5) {
  return new Promise(function(resolve, reject) {
    // Append given segments into a list.
    var segments = []
    for (var i = 1; i <= seg; i++) {
      segments.push({
        origin: eval('o_' + i),
        destination: eval('d_' + i),
        date: eval('date_' + i),
      })
    }

    // Create QPX query body.
    var data = {
      passengers: {
        adultCount: 1
      },
      slice: segments,
      maxPrice: 'USD' + budget,
      'solutions': 100
    };

    // Use promise to send the request.
    QPXApiClient.search(data).then(function(response) {
      resolve(format_flight(response));
    }).catch(function(err) {
      reject(new Error(err));
    });
  });
}


/**
 * format_flight - Reformat the flight information based on response.
 * Extract price and duration for sorting.
 *
 * @param  {Object} response raw response from parse_flight
 * @return {Object}          formatted flights results
 */
function format_flight(response) {
  return new Promise(function(resolve, reject) {
    var formatted = [];
    var raw = response['trips']['tripOption'];
    for (n in raw) {
      var tmp = {};
      tmp['currency'] = raw[n]['saleTotal'].substring(0, 3);
      tmp['price'] = parseInt(raw[n]['saleTotal'].substring(3));
      tmp['duration'] = 0;
      tmp['distance'] = 0;

      // For each tripOption.
      for (var i = 0; i < raw[n]['slice'].length; i++) {
        tmp['trip_' + i] = {};

        // For each segment (A->B).
        var j = 0
        for (; j < raw[n]['slice'][i]['segment'].length; j++) {

          // For each flight (leg) in each segment.
          var k = 0;
          for (; k < raw[n]['slice'][i]['segment'][j]['leg'].length; k++) {
            tmp['trip_' + i]['stop_' + k] = raw[n]['slice'][i]['segment'][j]['leg'][k];

            // Format airline and flight information.
            tmp['trip_' + i]['stop_' + k]['carrier'] = airlines.findWhere({
              iata: raw[n]['slice'][i]['segment'][j]['flight']['carrier']
            }).get('name')
            tmp['trip_' + i]['stop_' + k]['flight'] = raw[n]['slice'][i]['segment'][j]['flight']['number'];
            tmp['duration'] += tmp['trip_' + i]['stop_' + k]['duration']
            tmp['distance'] += tmp['trip_' + i]['stop_' + k]['mileage']
          }

          // Calculate the total stops.
          tmp['trip_' + i]['stop_number'] = k;
        }
      }
      formatted.push(tmp);
    }
    resolve(formatted);
  });
}


/**
 * parse_packages - Return list of flights and hotels that could form a package
 *
 * @param  {String} budget Total budget for this package
 * @param  {String} seg    How many segments the given trip has
 * @param  {String} star   The minimal star level the output hotel need to have
 * @param  {String} o_1    The 1st departure city
 * @param  {String} d_1    The 1st arrival city
 * @param  {String} date_1 The departure time for 1st trip, YYYY-MM-DD
 * @param  {String} o_2    The 2nd departure city
 * @param  {String} d_2    The 2nd arrival city
 * @param  {String} date_2 The departure time for 2nd trip, YYYY-MM-DD
 * @param  {String} o_3    The 3rd departure city
 * @param  {String} d_3    The 3rd arrival city
 * @param  {String} date_3 The departure time for 3rd trip, YYYY-MM-DD
 * @param  {String} o_4    The 4th departure city
 * @param  {String} d_4    The 4th arrival city
 * @param  {String} date_4 The departure time for 4th trip, YYYY-MM-DD
 * @param  {String} o_5    The 5th departure city
 * @param  {String} d_5    The 5th arrival city
 * @param  {String} date_5 The departure time for 5th trip, YYYY-MM-DD
 * @return {List}        formatted package results, [flights, hotels]
 */
function parse_packages(budget, seg, star, o_1, d_1, date_1, o_2, d_2, date_2, o_3, d_3, date_3, o_4, d_4, date_4, o_5, d_5, date_5) {
  return new Promise(function(resolve, reject) {
    var flights = [];
    var hotels = [];
    var res_count = 0;
    var lock = 0;

    // Workflow: parse flight first, then find hotel based on the arrival date
    // and budgets left.
    parse_flight(
      budget, seg,
      o_1, d_1, date_1,
      o_2, d_2, date_2,
      o_3, d_3, date_3,
      o_4, d_4, date_4,
      o_5, d_5, date_5
    ).then(function onFulfilled(response) {
      // With given flight result from Google, choose 3 trips.

      // Sort result based on price, return the lowest option.
      var price_sort = Object.keys(response).sort(
        function(a, b) {
          return response[a]['price'] - response[b]['price'];
        }
      );
      flights.push(response[price_sort[0]]);

      // Sort result based on duration, return the fastest option.
      var duration_sort = Object.keys(response).sort(
        function(a, b) {
          return response[a]['duration'] - response[b]['duration'];
        }
      );
      flights.push(response[duration_sort[0]]);

      // Sort result based on the distance, return the shortest option.
      var mileage_sort = Object.keys(response).sort(
        function(a, b) {
          return response[a]['distance'] - response[b]['distance'];
        }
      );
      flights.push(response[mileage_sort[0]]);

      console.log("Finished flight query.");

    }).then(function onFulfilled(response) {
      // Get hotel for each flight segment

      for (var i = 0; i < seg - 1; i++) {
        // count total threads for hotel query.
        res_count += 1;

        // Get last stop as checkin date.
        var stops = flights[0]['trip_' + i]['stop_number'];
        var checkin_date = flights[0]['trip_' + i]['stop_' + (stops - 1)]['arrivalTime'].substring(0, 10);
        var checkout_date = eval('date_' + (i + 2));

        console.log("Parsing hotels for ", eval('d_' + (i + 1)), checkin_date, checkout_date);
        parse_hotel(eval('d_' + (i + 1)), checkin_date, checkout_date)
          .then(function onFulfilled(response) {
            response = response[0];

            for (hotel in response) {
              // Remove hotel with too high price
              if (response[hotel]['rateWithTax'] + flights[0]['price'] >= budget) {
                delete response[hotel];
                continue;
              }

              // Remove hotel with low star rating. The default rating is 3 stars
              else if (star == null && response[hotel]['starRating'] < 3) {
                delete response[hotel];
                continue;
              } else if (response[hotel]['starRating'] < star) {
                delete response[hotel];
                continue;
              }

              if (response[hotel]['checkout'] == date_2) {
                response[hotel]['segment'] = 0;
              } else if (response[hotel]['checkout'] == date_3) {
                response[hotel]['segment'] = 1;
              } else if (response[hotel]['checkout'] == date_4) {
                response[hotel]['segment'] = 2;
              } else if (response[hotel]['checkout'] == date_5) {
                response[hotel]['segment'] = 3;
              }

            }

            // If no hotel left after filter.
            if (Object.keys(response).length == 0) {
              reject(new Error("No hotel option matches the price option, " +
                "please consider raise your budget."));
            }

            hotels.push(response);
            res_count -= 1;
          }).then(function onFulfilled(response) {
            if (res_count == 0) {
              console.log("Finished hotel query");

              // Sort hotel result for formatting.
              hotels = hotels.sort(function(a, b) {
                return a[Object.keys(a)[0]]['segment'] > b[Object.keys(b)[0]]['segment'] ? 1 : -1;
              });

              resolve([flights, hotels]);
            }
          }).catch(function(e) {
            reject(new Error(e));
          });
      }
    }).catch(function(e) {
      reject(new Error(e));
    });
  });
}


/**
 * select_package_hotels - Select hotels based on the search result for each
 * package.
 *
 * @param  {Object} value  Raw result from parse_hotel()
 * @param  {String} budget Total budge for the trip
 * @return {Object}        Selected hotel for each package
 */
function select_package_hotels(value, budget) {

  var flights = value[0];
  var hotels = value[1];
  var stack = [];

  for (segments of hotels) {
    if (stack.length == 0) {
      console.log("Segment length", Object.keys(segments).length);

      for (n in segments) {
        stack.push({
          'price': segments[n]['rateWithTax'],
          'percentRecommended': segments[n]['percentRecommended'],
          'starRating': segments[n]['starRating'],
          'totalReviews': segments[n]['totalReviews'],
          'guestRating': segments[n]['guestRating'],
          'trip_0': segments[n],
          'trip': 1,
        });
      }
      console.log(stack[stack.length - 1]['trip']);
    } else {
      var tmp = [];
      console.log("Segment length", Object.keys(segments).length);

      for (entry of stack) {
        for (n in segments) {
          var new_entry = {};

          new_entry['price'] = segments[n]['rateWithTax'] + entry['price'];

          // Drop option if exceed budget.
          if (new_entry['price'] + flights[0]['price'] >= budget) {
            continue;
          }

          new_entry['percentRecommended'] = segments[n]['percentRecommended'] + entry['percentRecommended'];
          new_entry['starRating'] = segments[n]['starRating'] + entry['starRating'];
          new_entry['totalReviews'] = segments[n]['totalReviews'] + entry['totalReviews'];
          new_entry['guestRating'] = segments[n]['guestRating'] + entry['guestRating'];
          if (typeof entry['trip_0'] !== 'undefined') {
            new_entry['trip_0'] = JSON.parse(JSON.stringify(entry['trip_0']));
          }

          if (typeof entry['trip_1'] !== 'undefined') {
            new_entry['trip_1'] = JSON.parse(JSON.stringify(entry['trip_1']));
          }

          if (typeof entry['trip_2'] !== 'undefined') {
            new_entry['trip_2'] = JSON.parse(JSON.stringify(entry['trip_2']));
          }

          if (typeof entry['trip_3'] !== 'undefined') {
            new_entry['trip_3'] = JSON.parse(JSON.stringify(entry['trip_3']));
          }
          new_entry['trip_' + segments[n]['segment']] = segments[n];
          new_entry['trip'] = entry['trip'] + 1;

          tmp.push(new_entry);
        }
      }
      stack = tmp;
      console.log(stack[stack.length - 1]['trip']);
    }
  }

  var hotel_result = [];
  // Sort result based on guest rating, return the highest option.
  var rating_sort = Object.keys(stack).sort(
    function(a, b) {
      return stack[b]['totalRecommendations'] - stack[a]['totalRecommendations'];
    }
  );
  // [0] is due to the extra [ ] in hotel parser.
  hotel_result.push(stack[rating_sort[0]]);

  // Sort result based on recommendation, return the highest option.
  var recom_sort = Object.keys(stack).sort(
    function(a, b) {
      return stack[b]['guestRating'] - stack[a]['guestRating'];
    }
  );
  hotel_result.push(stack[recom_sort[0]]);

  // Sort result based on price ratio, return the highest option.
  var price_sort = Object.keys(stack).sort(
    function(a, b) {
      return stack[a]['price'] / stack[a]['starRating'] - stack[b]['price'] / stack[b]['starRating'];
    }
  );
  hotel_result.push(stack[price_sort[0]]);

  return hotel_result;
}
