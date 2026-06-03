package tn.insat.tp3;

import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.api.java.UDF1;
import org.apache.spark.sql.api.java.UDF2;
import org.apache.spark.sql.types.DataTypes;
import static org.apache.spark.sql.functions.*;

public class BatchWeatherAnalytics {
    public static void main(String[] args) {
        // Initialize Spark Session
        SparkSession spark = SparkSession.builder()
                .appName("Vietnam Batch Weather Analytics")
                // Disable broadcast join to demonstrate Sort-Merge Join (Requirement 3:
                // Sort-merge join)
                .config("spark.sql.autoBroadcastJoinThreshold", -1)
                .config("spark.hadoop.dfs.client.use.datanode.hostname", "true")
                .getOrCreate();

        // Requirement 2: Custom UDF (Calculate Heat Index/Perceived Temperature)
        // A simple formula based approximation
        UDF2<Double, Double, Double> heatIndexUDF = (temperature, humidity) -> {
            if (temperature == null || humidity == null)
                return null;
            // Simple approximation for demonstration: T + 0.05 * humidity
            return Math.round((temperature + (0.05 * humidity)) * 10.0) / 10.0;
        };
        // Registering the UDF with Spark
        spark.udf().register("calculateHeatIndex", heatIndexUDF, DataTypes.DoubleType);

        // PM2.5 → US EPA AQI (same UDF as StreamingAQI, needed for daily avg_aqi/peak).
        UDF1<Double, Integer> calculateAQI = (pm25) -> {
            if (pm25 == null)
                return 0;
            double c = pm25;
            if (c <= 12.0)
                return (int) Math.round((50.0 / 12.0) * c);
            if (c <= 35.4)
                return (int) Math.round(((100.0 - 51.0) / (35.4 - 12.1)) * (c - 12.1) + 51.0);
            if (c <= 55.4)
                return (int) Math.round(((150.0 - 101.0) / (55.4 - 35.5)) * (c - 35.5) + 101.0);
            if (c <= 150.4)
                return (int) Math.round(((200.0 - 151.0) / (150.4 - 55.5)) * (c - 55.5) + 151.0);
            if (c <= 250.4)
                return (int) Math.round(((300.0 - 201.0) / (250.4 - 150.5)) * (c - 150.5) + 201.0);
            if (c <= 350.4)
                return (int) Math.round(((400.0 - 301.0) / (350.4 - 250.5)) * (c - 250.5) + 301.0);
            if (c <= 500.4)
                return (int) Math.round(((500.0 - 401.0) / (500.4 - 350.5)) * (c - 350.5) + 401.0);
            return 500;
        };
        spark.udf().register("pm25ToAQI", calculateAQI, DataTypes.IntegerType);

        // 1. Read the Master Dataset (Historical CSVs + Streaming Parquet Dumps)
        System.out.println("Reading Weather Data from Master Dataset...");
        Dataset<Row> weatherDf = null;

        Dataset<Row> historicalDf = null;
        try {
            System.out.println("Attempting to load historical CSV dataset from HDFS...");
            historicalDf = spark.read()
                    .option("header", "true")
                    .option("inferSchema", "true")
                    // The path where the manual CSV export is stored in HDFS
                    .csv("hdfs://namenode:9000/user/data/raw/weather_data/")
                    .withColumnRenamed("time", "timestamp")
                    // date as STRING "yyyy-MM-dd" (NOT DateType) so it matches the
                    // string dates the API /daily filter + seed/fillBatch use.
                    // to_date() would store a BSON Date → $gte/$lte string range
                    // (from the History page) silently matches nothing.
                    .withColumn("date", date_format(col("timestamp"), "yyyy-MM-dd"))
                    .withColumn("temp", col("temp").cast(DataTypes.DoubleType))
                    .withColumn("rhum", col("rhum").cast(DataTypes.DoubleType))
                    .withColumnRenamed("temp", "temperature")
                    .withColumnRenamed("rhum", "humidity");
            // station_id not available in historical CSV — will be null after unionByName
            // pm25/no2 not available in historical CSV — will be null after unionByName
            // unionByName(allowMissingColumns=true) handles this gracefully
        } catch (Exception e) {
            System.out.println(
                    "No historical CSV dataset found on HDFS at /user/data/raw/weather_data/ (" + e.getMessage() + ")");
        }

        // Cửa sổ 30 ngày gần nhất (rolling window)
        String yesterday = java.time.LocalDate.now().minusDays(1).toString();
        String thirtyDaysAgo = java.time.LocalDate.now().minusDays(30).toString();
        System.out.println("Processing 30-day window: " + thirtyDaysAgo + " → " + yesterday);

        Dataset<Row> streamedDf = null;
        try {
            System.out.println("Attempting to load streaming Parquet dataset from HDFS...");
            streamedDf = spark.read()
                    // Partition pruning: Spark chỉ đọc các thư mục date= trong khoảng 30 ngày
                    // Bỏ qua toàn bộ data cũ hơn 30 ngày → hiệu quả dù HDFS có năm trước
                    .parquet("hdfs://namenode:9000/user/data/raw/weather_data_stream/")
                    .filter(col("date").geq(thirtyDaysAgo).and(col("date").leq(yesterday)));
        } catch (Exception e) {
            System.out.println("No streaming Parquet dataset found on HDFS at /user/data/raw/weather_data_stream/ ("
                    + e.getMessage() + ")");
        }

        // Union the datasets if both exist
        if (historicalDf != null && streamedDf != null) {
            System.out.println("Combining historical and streaming datasets.");
            // allowMissingColumns=true prevents crashes if schemas differ slightly
            weatherDf = historicalDf.unionByName(streamedDf, true);
        } else if (historicalDf != null) {
            System.out.println("Using only historical dataset.");
            weatherDf = historicalDf;
        } else if (streamedDf != null) {
            System.out.println("Using only streaming dataset.");
            weatherDf = streamedDf;
        }

        // Fallback to local mock data if absolutely nothing is on HDFS
        if (weatherDf == null) {
            System.err.println("No datasets found on HDFS. Falling back to local mock CSV data...");
            weatherDf = spark.read()
                    .option("header", "true")
                    .option("inferSchema", "true")
                    // Upload this CSV to HDFS first:
                    // docker cp vietnam_weather_batch.csv namenode:/tmp/
                    // docker exec namenode hdfs dfs -put /tmp/vietnam_weather_batch.csv
                    // hdfs://namenode:9000/user/data/raw/
                    .csv("hdfs://namenode:9000/user/data/raw/vietnam_weather_batch.csv");
        }

        // 2. Read the static Geography data
        System.out.println("============================================================>");
        System.out.println("Reading Station Data...");
        System.out.println("============================================================>");
        Dataset<Row> stationsDf = spark.read()
                .option("header", "true")
                .option("inferSchema", "true")
                .option("ignoreLeadingWhiteSpace", "true")
                .option("ignoreTrailingWhiteSpace", "true")
                .csv("hdfs://namenode:9000/user/data/static/vietnam_stations.csv");

        // Requirement 3: Sort-Merge Join
        // Since we disabled autoBroadcastJoinThreshold, Spark will use SortMergeJoin
        // for this
        // Broadcast join: copy the small data to all worker nodes
        // Sort-Merge join: sort the large data and merge the two sorted datasets
        // Dataset<Row> enrichedDf = weatherDf.join(stationsDf, "station_id");
        Dataset<Row> enrichedDf = weatherDf.join(stationsDf,
                weatherDf.col("station_id").equalTo(stationsDf.col("station_id")),
                "left")
                // equality-condition join keeps BOTH station_id columns → drop the
                // stations-side copy so later references aren't AMBIGUOUS_REFERENCE.
                .drop(stationsDf.col("station_id"));

        // Complex Multi-stage Transformation (Req 2)
        Dataset<Row> transformedDf = enrichedDf
                .withColumn("heat_index", callUDF("calculateHeatIndex", col("temperature"), col("humidity")))
                .withColumn("weather_condition",
                        when(col("pm25").gt(150), "Hazardous")
                                .when(col("temperature").gt(35), "Extreme Heat")
                                .otherwise("Normal"));

        /*
         * đoạn trên tính toán heat_index và weather_condition dựa trên nhiệt độ và độ
         * ẩm xem thời tiết như thế nào
         * nó thêm 2 column mới cho dataframe
         * heat_index tính toán chỉ số nhiệt dựa trên nhiệt độ và độ ẩm
         * weather_condition là mô tả điều kiện thời tiết dựa trên pm2.5 và nhiệt độ
         */

        // Requirement 4: Caching/Persistence strategy
        transformedDf.cache();
        /*
         * cache() sẽ lưu dữ liệu vào bộ nhớ để có thể sử dụng lại nhiều lần
         * Lưu ý quan trọng:
         * .cache() không phải là lưu vào RAM của một máy duy nhất!
         * .cache() trong Spark lưu dữ liệu phân tán trên memory của tất cả worker
         * nodes,
         * không phải một máy duy nhất.
         * transformedDf.cache();
         * transformedDf.show(); // Lần 1 → trigger Action
         * transformedDf.groupBy(...) // Lần 2 → provinceDf
         * transformedDf.groupBy(...) // Lần 3 → có thể có thêm aggregation khác
         * Không có cache → mỗi lần dùng transformedDf, Spark phải làm lại từ đầu:
         * 
         * 
         */
        transformedDf.show();

        // Requirement 1: Complex Aggregation — Per-Province Daily Stats (all 34 stations)
        // Thêm "date" vào groupBy → mỗi dòng = thống kê 1 ngày của 1 tỉnh
        // Thực tế hơn: theo dõi xu hướng theo ngày thay vì all-time average
        // Per-reading hour + AQI so the daily rollup can carry avg_aqi + peak_aqi_hour.
        Dataset<Row> withHourAqi = transformedDf
                .withColumn("hour", hour(col("timestamp")))
                .withColumn("aqi", callUDF("pm25ToAQI", col("pm25")));

        System.out.println("--- Per-Province DAILY Analytics (date × 34 Stations) ---");
        Dataset<Row> provinceDf = withHourAqi
                .groupBy("date", "station_id", "province", "region")
                .agg(
                        round(avg("temperature"), 1).alias("avg_temp"),
                        round(max("temperature"), 1).alias("max_temp"),
                        round(min("temperature"), 1).alias("min_temp"),
                        round(avg("humidity"), 1).alias("avg_humidity"),
                        round(avg("pm25"), 2).alias("avg_pm25"),
                        round(avg("no2"), 2).alias("avg_no2"),
                        round(avg("aqi"), 0).alias("avg_aqi"),
                        // max(struct(aqi, hour)) picks the hour of the day's peak AQI.
                        max(struct(col("aqi"), col("hour"))).alias("peak"),
                        count("*").alias("record_count"))
                .withColumn("peak_aqi_hour", col("peak.hour"))
                .drop("peak")
                .orderBy("date", "region", "province");
        provinceDf.show(34, false);

        // Per-station 30-day SUMMARY (one averaged row per station, no date).
        System.out.println("--- Per-Station 30-Day Average Summary (34 Stations) ---");
        Dataset<Row> stationAvgDf = withHourAqi
                .groupBy("station_id", "province", "region")
                .agg(
                        round(avg("temperature"), 1).alias("avg_temp"),
                        round(max("temperature"), 1).alias("max_temp"),
                        round(avg("humidity"), 1).alias("avg_humidity"),
                        round(avg("pm25"), 2).alias("avg_pm25"),
                        round(avg("no2"), 2).alias("avg_no2"),
                        count("*").alias("record_count"))
                .orderBy("region", "province");
        stationAvgDf.show(34, false);

        // Requirement 4: Partition Pruning 
        // Saving the output partitioned by Region heavily optimizes future querying!
        System.out.println("Saving analytical results via Partitioning...");
        String outputPath = "hdfs://namenode:9000/user/data/processed/weather_historical.parquet";

        try {
            transformedDf.write()
                    .mode("overwrite")
                    .partitionBy("region", "date") // Requirement 4: Partitioning
                    .parquet(outputPath);
            System.out.println("Saved successfully to " + outputPath);
        } catch (Exception e) {
            System.out.println("Could not save to Parquet. Error: " + e.getMessage());
        }
        /*
         * Không có partitionBy — tất cả trong 1 thư mục
         * weather_historical.parquet/
         * ├── part-00000.parquet ← tất cả data của North + Central + South trộn lẫn
         * ├── part-00001.parquet
         * └── part-00002.parquet
         * Khi query WHERE region = 'North' → Spark phải đọc hết tất cả file rồi lọc →
         * chậm.
         * 
         * Với .partitionBy("region", "date") — tổ chức thành thư mục con
         * weather_historical.parquet/
         * ├── region=North/
         * │ ├── date=2025-05-01/
         * │ │ └── part-00000.parquet ← chỉ data North ngày 01
         * │ ├── date=2025-05-02/
         * │ │ └── part-00000.parquet
         * │ └── date=2025-05-03/
         * │ └── part-00000.parquet
         * ├── region=Central/
         * │ ├── date=2025-05-01/
         * │ │ └── part-00000.parquet
         * │ └── ...
         * └── region=South/
         * └── ...
         * Spark bỏ qua hoàn toàn các thư mục không liên quan — gọi là Partition
         * Pruning.
         */

        // --- LAMBDA ARCHITECTURE: SERVING LAYER ---
        // Writing the Batch views to MongoDB so they can be queried alongside the Speed
        // Layer
        System.out.println("Pushing Batch Aggregations to MongoDB (Serving Layer)...");

        // Collection 1: Per-station 30-day average summary (34 rows)
        try {
            stationAvgDf.write()
                    .format("mongo")
                    .mode("overwrite")
                    .option("spark.mongodb.output.uri", "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                    .option("spark.mongodb.output.database", "Big_Data")
                    .option("spark.mongodb.output.collection", "BatchHistoricalAggregations")
                    .save();
            System.out.println("Successfully pushed Per-Station Summary to MongoDB!");
        } catch (Exception e) {
            System.out.println("Could not save Per-Station Summary to MongoDB. Error: " + e.getMessage());
        }

        // Collection 2: Per-day per-station stats (date × 34 stations = up to 1020 rows)
        try {
            provinceDf.write()
                    .format("mongo")
                    // overwrite: xóa collection cũ và ghi lại 30 ngày gần nhất
                    // Mỗi lần batch chạy → MongoDB luôn có đúng 30 ngày mới nhất
                    // Không bị duplicate, không phình to ứ theo năm
                    .mode("overwrite")
                    .option("spark.mongodb.output.uri", "mongodb+srv://tuyen:tuyen@cluster0.tkzrw9q.mongodb.net/")
                    .option("spark.mongodb.output.database", "Big_Data")
                    .option("spark.mongodb.output.collection", "ProvinceAggregations")
                    .save();
            System.out.println("Successfully pushed Province Aggregations 30-day window to MongoDB!");
        } catch (Exception e) {
            System.out.println("Could not save Province Aggregations to MongoDB. Error: " + e.getMessage());
        }

        spark.stop();
    }
}
