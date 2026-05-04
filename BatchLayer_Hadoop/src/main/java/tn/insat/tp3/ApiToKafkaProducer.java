package tn.insat.tp3;

import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class ApiToKafkaProducer {

    public static void main(String[] args) {
        // 1. Configure Kafka Producer
        Properties props = new Properties();
        props.put("bootstrap.servers", "localhost:9092,localhost:9093,localhost:9094");
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

        Producer<String, String> producer = new KafkaProducer<>(props);

        // This is the EXACT topic that StreamingAQI.java expects to read from
        String topic = "vn_weather_stream";

        // Map of 34 Provinces/Cities to Station IDs
        Map<String, String> cityStations = new HashMap<>();
        cityStations.put("Ha Noi", "HN01");
        cityStations.put("Hue", "HUE01");
        cityStations.put("Lai Chau", "LC01");
        cityStations.put("Dien Bien", "DB01");
        cityStations.put("Son La", "SL01");
        cityStations.put("Lang Son", "LS01");
        cityStations.put("Quang Ninh", "QN01");
        cityStations.put("Thanh Hoa", "TH01");
        cityStations.put("Nghe An", "NA01");
        cityStations.put("Ha Tinh", "HT01");
        cityStations.put("Cao Bang", "CB01");
        cityStations.put("Tuyen Quang", "TQ01");
        cityStations.put("Lao Cai", "LC02");
        cityStations.put("Thai Nguyen", "TN01");
        cityStations.put("Phu Tho", "PT01");
        cityStations.put("Bac Ninh", "BN01");
        cityStations.put("Hung Yen", "HY01");
        cityStations.put("Hai Phong", "HP01");
        cityStations.put("Ninh Binh", "NB01");
        cityStations.put("Quang Tri", "QT01");
        cityStations.put("Da Nang", "DN01");
        cityStations.put("Quang Ngai", "QNG01");
        cityStations.put("Gia Lai", "GL01");
        cityStations.put("Khanh Hoa", "KH01");
        cityStations.put("Lam Dong", "LD01");
        cityStations.put("Dak Lak", "DL01");
        cityStations.put("Ho Chi Minh City", "HCM01");
        cityStations.put("Dong Nai", "DN02");
        cityStations.put("Tay Ninh", "TN02");
        cityStations.put("Can Tho", "CT01");
        cityStations.put("Vinh Long", "VL01");
        cityStations.put("Dong Thap", "DT01");
        cityStations.put("Ca Mau", "CM01");
        cityStations.put("An Giang", "AG01");

        System.out.println("Starting Real Weather API fetcher for 34 Cities to Kafka...");

        // Thread pool: 34 threads = all cities fetched in parallel
        ExecutorService executor = Executors.newFixedThreadPool(34);

        while (true) {
            List<Future<?>> futures = new ArrayList<>();

            for (Map.Entry<String, String> entry : cityStations.entrySet()) {
                final String cityName = entry.getKey();
                final String stationId = entry.getValue();

                Future<?> future = executor.submit(() -> {
                    try {
                    // URL encode the city name (e.g., "Ho Chi Minh City" -> "Ho%20Chi%20Minh%20City")
                        String encodedCity = cityName.replace(" ", "%20");
                        URL url = new URL(
                                "http://api.weatherapi.com/v1/current.json?key=a612c6e61fb347f38ed92614261104&q=" + encodedCity + "&aqi=yes");
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("GET");
                        conn.setConnectTimeout(15000); // 15s connect timeout
                        conn.setReadTimeout(90000);    // 90s read timeout (handles slow API)

                    // Check if request was successful
                        if (conn.getResponseCode() != 200) {
                            System.err.println("Failed to fetch data for " + cityName + " - HTTP " + conn.getResponseCode());
                            return;
                        }

                        BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                        String inputLine;
                        StringBuilder content = new StringBuilder();
                        while ((inputLine = in.readLine()) != null) {
                            content.append(inputLine);
                        }
                        in.close();
                        conn.disconnect();

                    // Parse the response
                        JSONObject jsonResponse = new JSONObject(content.toString());
                        JSONObject currentData = jsonResponse.getJSONObject("current");
                        JSONObject airQuality = currentData.getJSONObject("air_quality");

                    // Extract REAL data from API (Weather + AQI combined)
                        double temperature = currentData.getDouble("temp_c");
                        double humidity = currentData.getDouble("humidity");
                        double pm25Value = airQuality.optDouble("pm2_5", 0.0);
                        double no2 = airQuality.optDouble("no2", 0.0);

                        long timestamp = System.currentTimeMillis();

                    // 2. Formatting the message as STRICT JSON
                        JSONObject kafkaMessage = new JSONObject();
                        kafkaMessage.put("date", new java.sql.Date(timestamp).toString());
                        kafkaMessage.put("timestamp", new java.sql.Timestamp(timestamp).toString());
                        kafkaMessage.put("station_id", stationId);
                        kafkaMessage.put("pm25", pm25Value);
                        kafkaMessage.put("temperature", temperature);
                        kafkaMessage.put("humidity", humidity);
                        kafkaMessage.put("no2", no2);

                        System.out.println("Station ID: " + stationId);
                        System.out.println("Temperature: " + temperature);
                        System.out.println("Humidity: " + humidity);
                        System.out.println("PM2.5: " + pm25Value);
                        System.out.println("NO2: " + no2);
                        System.out.println("Timestamp: " + timestamp);

                        String finalJsonString = kafkaMessage.toString();

                    // 3. Send message payload to Kafka (Round-robin across all partitions)
                        producer.send(new ProducerRecord<>(topic, finalJsonString));
                        System.out.println("Sent " + cityName + " (" + stationId + ") to Kafka -> Temp: " + temperature + ", PM2.5: " + pm25Value);

                    } catch (Exception e) {
                        System.err.println("API Error for " + cityName + ": " + e.getMessage());
                    }
                });

                futures.add(future);
            }

            // Wait for ALL 34 cities to finish before sleeping
            for (Future<?> f : futures) {
                try { f.get(); } catch (Exception e) {
                    System.err.println("Thread error: " + e.getMessage());
                }
            }

            // Force-flush all buffered messages to Kafka before sleeping
            producer.flush();
            System.out.println("All messages flushed to Kafka.");

            System.out.println("Finished a full batch of 34 cities. Waiting 2 minutes before next update...");
            try {
                // Wait 2 minutes before starting the next full cycle
                Thread.sleep(120000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
}
